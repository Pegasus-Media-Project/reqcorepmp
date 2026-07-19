import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, interviewSlot } from '../../../database/schema'
import { applicationIdParamSchema } from '../../../utils/schemas/application'
import { sendSlotInvitationSchema } from '../../../utils/schemas/interviewSlot'
import { sendSlotInvitationForApplication } from '../../../utils/slot-scheduling'

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
 * the job's open slots. Solo+ (`interviews`) feature. The email template comes
 * from the job's availability settings (or the built-in default).
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
    columns: { id: true, jobId: true },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
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

  const { candidateEmail } = await sendSlotInvitationForApplication({
    orgId,
    applicationId: id,
    origin: getRequestURL(event).origin,
    customSubject: body.customSubject,
    customBody: body.customBody,
  })

  lastSentAt.set(id, Date.now())

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: { action: 'slot_invitation_sent', candidateEmail },
  })

  return { success: true, sentAt: new Date(), candidateEmail }
})
