import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, candidate, job, organization, careerPage, interviewSlot } from '../../../database/schema'
import { applicationIdParamSchema } from '../../../utils/schemas/application'
import { sendSlotInvitationSchema } from '../../../utils/schemas/interviewSlot'
import { buildBookingUrl } from '../../../utils/interview-token'
import {
  sendSlotInvitationEmail,
  renderTemplateGeneric,
  DEFAULT_SLOT_INVITATION_SUBJECT,
  DEFAULT_SLOT_INVITATION_BODY,
} from '../../../utils/email'

/**
 * Best-effort per-application resend cooldown (2 minutes). In-memory, so it is
 * per-instance — a lightweight guard against accidental double-sends, not a
 * hard distributed rate limit.
 */
const lastSentAt = new Map<string, number>()
const COOLDOWN_MS = 2 * 60 * 1000

/**
 * POST /api/applications/:id/send-slot-invitation
 * Email the candidate a link to self-schedule their interview by booking one of
 * the job's open slots. Solo+ (`interviews`) feature.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationInScope(session, id)
  const body = await readValidatedBody(event, sendSlotInvitationSchema.parse)

  const prev = lastSentAt.get(id)
  if (prev && Date.now() - prev < COOLDOWN_MS) {
    throw createError({ statusCode: 429, statusMessage: 'Invitation was already sent recently. Please wait before resending.' })
  }

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, id), eq(application.organizationId, orgId)),
    with: {
      candidate: { columns: { firstName: true, lastName: true, email: true } },
      job: { columns: { title: true } },
    },
  })
  if (!app || !app.candidate) {
    throw createError({ statusCode: 404, statusMessage: 'Application or candidate not found' })
  }
  if (!app.candidate.email) {
    throw createError({ statusCode: 422, statusMessage: 'Candidate has no email address on file.' })
  }

  // Don't send a scheduling link that leads to an empty calendar.
  const [bookable] = await db.select({ id: interviewSlot.id })
    .from(interviewSlot)
    .where(and(
      eq(interviewSlot.jobId, app.jobId),
      eq(interviewSlot.organizationId, orgId),
      eq(interviewSlot.status, 'open'),
      gt(interviewSlot.startsAt, new Date()),
      lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
    ))
    .limit(1)
  if (!bookable) {
    throw createError({
      statusCode: 422,
      statusMessage: 'This job has no open interview times. Set availability (or add slots) on the job page first.',
    })
  }

  // Resolve org name + logo (same logic as the application-confirmation email).
  const origin = getRequestURL(event).origin
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true, logo: true, slug: true },
  })
  const cp = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: { slug: true, logoStorageKey: true, updatedAt: true, enabled: true },
  })
  const orgName = org?.name?.trim() || 'Pegasus Media Project'
  let logoUrl: string | undefined
  const cpSlug = cp?.slug ?? org?.slug ?? null
  if (cp?.logoStorageKey && cpSlug && (cp.enabled ?? true)) {
    logoUrl = `${origin}/api/public/career-page/${cpSlug}/asset?kind=logo&v=${new Date(cp.updatedAt).getTime()}`
  } else if (org?.logo && /^https?:\/\//i.test(org.logo)) {
    logoUrl = org.logo
  }

  // Base URL for the public booking link (mirrors send-invitation derivation).
  const baseUrl = env.BETTER_AUTH_URL
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || origin
    || 'https://reqcore.com'

  const bookingUrl = buildBookingUrl(baseUrl, id, env.BETTER_AUTH_SECRET)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim()
  const vars: Record<string, string> = {
    candidateName,
    candidateFirstName: app.candidate.firstName,
    candidateLastName: app.candidate.lastName,
    jobTitle: app.job?.title ?? '',
    organizationName: orgName,
    bookingUrl,
    expiresAt,
  }

  const subjectTemplate = body.customSubject || DEFAULT_SLOT_INVITATION_SUBJECT
  const bodyTemplate = body.customBody || DEFAULT_SLOT_INVITATION_BODY

  await sendSlotInvitationEmail({
    to: app.candidate.email,
    subject: renderTemplateGeneric(subjectTemplate, vars),
    body: renderTemplateGeneric(bodyTemplate, vars),
    organizationName: orgName,
    logoUrl,
  })

  lastSentAt.set(id, Date.now())

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: { action: 'slot_invitation_sent', candidateEmail: app.candidate.email },
  })

  return { success: true, sentAt: new Date(), candidateEmail: app.candidate.email }
})
