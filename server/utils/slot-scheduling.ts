/**
 * Shared helpers for candidate self-scheduling: sending the "pick a time"
 * invitation and cancelling the booked interviews attached to a slot.
 * Used by the send-slot-invitation endpoint, slot deletion, bulk deletion,
 * and availability regeneration ("rebook" flow).
 */
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import {
  application, candidate, job, organization, careerPage,
  interview, interviewSlot, interviewSlotBooking, jobInterviewAvailability, emailTemplate,
} from '../database/schema'
import { SYSTEM_TEMPLATES } from '~~/shared/system-templates'
import { buildBookingUrl } from './interview-token'
import {
  sendSlotInvitationEmail,
  sendInterviewCancellationEmail,
  renderTemplateGeneric,
  DEFAULT_SLOT_INVITATION_SUBJECT,
  DEFAULT_SLOT_INVITATION_BODY,
} from './email'
import { cancelCalendarEvent } from './google-calendar'

/** Resolve org display name + logo URL (shared email-branding lookup). */
export async function resolveOrgBranding(orgId: string, origin: string) {
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
  }
  else if (org?.logo && /^https?:\/\//i.test(org.logo)) {
    logoUrl = org.logo
  }
  return { orgName, logoUrl }
}

/** The base URL candidates reach the app on (mirrors send-invitation). */
export function resolvePublicBaseUrl(origin?: string): string {
  return env.BETTER_AUTH_URL
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || origin
    || 'https://reqcore.com'
}

/**
 * Send the self-schedule ("pick a time") invitation for an application, using
 * the job's configured template when one is set. Throws if the application or
 * candidate email is missing; transport failures propagate from sendEmail.
 * Optional custom subject/body override the template resolution entirely.
 */
export async function sendSlotInvitationForApplication(params: {
  orgId: string
  applicationId: string
  origin: string
  customSubject?: string
  customBody?: string
}): Promise<{ candidateEmail: string }> {
  const { orgId, applicationId, origin } = params

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
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

  const { orgName, logoUrl } = await resolveOrgBranding(orgId, origin)
  const baseUrl = resolvePublicBaseUrl(origin)
  const bookingUrl = buildBookingUrl(baseUrl, applicationId, env.BETTER_AUTH_SECRET)
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

  // Template resolution: explicit custom text → the job's configured template
  // (system id or custom emailTemplate row) → the built-in default.
  let subjectTemplate = DEFAULT_SLOT_INVITATION_SUBJECT
  let bodyTemplate = DEFAULT_SLOT_INVITATION_BODY
  if (params.customSubject && params.customBody) {
    subjectTemplate = params.customSubject
    bodyTemplate = params.customBody
  }
  else {
    const availability = await db.query.jobInterviewAvailability.findFirst({
      where: and(
        eq(jobInterviewAvailability.jobId, app.jobId),
        eq(jobInterviewAvailability.organizationId, orgId),
      ),
      columns: { invitationTemplateId: true },
    })
    const templateId = availability?.invitationTemplateId
    if (templateId) {
      const system = SYSTEM_TEMPLATES.find(t => t.id === templateId)
      if (system) {
        subjectTemplate = system.subject
        bodyTemplate = system.body
      }
      else {
        const custom = await db.query.emailTemplate.findFirst({
          where: and(eq(emailTemplate.id, templateId), eq(emailTemplate.organizationId, orgId)),
          columns: { subject: true, body: true },
        })
        if (custom) {
          subjectTemplate = custom.subject
          bodyTemplate = custom.body
        }
      }
    }
  }

  await sendSlotInvitationEmail({
    to: app.candidate.email,
    subject: renderTemplateGeneric(subjectTemplate, vars),
    body: renderTemplateGeneric(bodyTemplate, vars),
    organizationName: orgName,
    logoUrl,
  })

  return { candidateEmail: app.candidate.email }
}

export interface SlotBookingInfo {
  bookingId: string
  interviewId: string | null
  applicationId: string
  candidateName: string
  interviewStatus: string | null
}

/** The confirmed bookings on a slot, with candidate names for UI prompts. */
export async function listSlotBookings(orgId: string, slotId: string): Promise<SlotBookingInfo[]> {
  const rows = await db
    .select({
      bookingId: interviewSlotBooking.id,
      interviewId: interviewSlotBooking.interviewId,
      applicationId: interviewSlotBooking.applicationId,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      interviewStatus: interview.status,
    })
    .from(interviewSlotBooking)
    .innerJoin(application, eq(interviewSlotBooking.applicationId, application.id))
    .innerJoin(candidate, eq(application.candidateId, candidate.id))
    .leftJoin(interview, eq(interviewSlotBooking.interviewId, interview.id))
    .where(and(
      eq(interviewSlotBooking.slotId, slotId),
      eq(interviewSlotBooking.organizationId, orgId),
      eq(interviewSlotBooking.status, 'confirmed'),
    ))
  return rows.map(r => ({
    bookingId: r.bookingId,
    interviewId: r.interviewId,
    applicationId: r.applicationId,
    candidateName: `${r.firstName} ${r.lastName}`.trim(),
    interviewStatus: r.interviewStatus,
  }))
}

/**
 * Cancel every confirmed booking on a slot: booking → cancelled, its scheduled
 * interview → cancelled (with best-effort Google Calendar cancel + candidate
 * email), and the slot's counter released. Returns the affected applications.
 */
export async function cancelSlotBookings(params: {
  orgId: string
  slotId: string
  /** Appended to the cancellation email (e.g. announcing a new picker link). */
  followUpNote?: string
  /** Skip candidate emails entirely (rebook flow sends its own invite). */
  notify?: boolean
}): Promise<{ applicationIds: string[] }> {
  const { orgId, slotId } = params
  const notify = params.notify ?? true
  const bookings = await listSlotBookings(orgId, slotId)
  const applicationIds: string[] = []

  for (const b of bookings) {
    applicationIds.push(b.applicationId)

    await db.update(interviewSlotBooking)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(interviewSlotBooking.id, b.bookingId))

    if (b.interviewId && b.interviewStatus === 'scheduled') {
      const [iv] = await db.update(interview)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(interview.id, b.interviewId), eq(interview.organizationId, orgId)))
        .returning()

      if (iv?.googleCalendarEventId) {
        cancelCalendarEvent(iv.createdById, iv.googleCalendarEventId).catch((err) => {
          logError('calendar.cancel_event_failed', {
            event_id: iv.googleCalendarEventId,
            error_message: err instanceof Error ? err.message : String(err),
          })
        })
      }

      if (notify && iv) {
        try {
          const app = await db.query.application.findFirst({
            where: eq(application.id, b.applicationId),
            with: {
              candidate: { columns: { firstName: true, email: true } },
              job: { columns: { title: true } },
            },
          })
          if (app?.candidate?.email) {
            const { orgName } = await resolveOrgBranding(orgId, '')
            const when = new Date(iv.scheduledAt)
            const tz = iv.timezone ?? 'UTC'
            await sendInterviewCancellationEmail({
              to: app.candidate.email,
              candidateFirstName: app.candidate.firstName,
              jobTitle: app.job?.title ?? '',
              organizationName: orgName,
              interviewTitle: iv.title,
              interviewDate: when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz }),
              interviewTime: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }),
              followUpNote: params.followUpNote,
            })
          }
        }
        catch (err) {
          logError('email.interview_cancellation_send_failed', {
            interview_id: b.interviewId,
            error_message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  // Release the seats all at once.
  if (bookings.length) {
    await db.update(interviewSlot)
      .set({ bookedCount: 0, updatedAt: new Date() })
      .where(and(eq(interviewSlot.id, slotId), eq(interviewSlot.organizationId, orgId)))
  }

  return { applicationIds }
}

/**
 * Release the seat one interview holds on its slot: the confirmed booking (if
 * any) → cancelled, and the slot's counter decremented so the spot can be
 * offered again. Callers gate on the interview still being 'scheduled' —
 * that is what guarantees the seat is currently held and prevents a
 * cancel-then-delete sequence from decrementing twice.
 */
export async function releaseSlotSeatForInterview(orgId: string, interviewId: string, slotId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(interviewSlotBooking)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(interviewSlotBooking.interviewId, interviewId),
        eq(interviewSlotBooking.organizationId, orgId),
        eq(interviewSlotBooking.status, 'confirmed'),
      ))
    await tx.update(interviewSlot)
      .set({ bookedCount: sql`${interviewSlot.bookedCount} - 1`, updatedAt: new Date() })
      .where(and(
        eq(interviewSlot.id, slotId),
        eq(interviewSlot.organizationId, orgId),
        gt(interviewSlot.bookedCount, 0),
      ))
  })
}

/**
 * Re-claim the seat when a cancelled slot-linked interview is restored to
 * 'scheduled'. Returns false when the spot can no longer be taken back —
 * the slot has since filled, or the candidate holds a confirmed booking
 * elsewhere (the partial unique index on confirmed bookings rolls the
 * transaction back).
 */
export async function reclaimSlotSeatForInterview(orgId: string, interviewId: string, slotId: string): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx.update(interviewSlot)
        .set({ bookedCount: sql`${interviewSlot.bookedCount} + 1`, updatedAt: new Date() })
        .where(and(
          eq(interviewSlot.id, slotId),
          eq(interviewSlot.organizationId, orgId),
          lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
        ))
        .returning({ id: interviewSlot.id })
      if (!claimed) return false
      await tx.update(interviewSlotBooking)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(
          eq(interviewSlotBooking.interviewId, interviewId),
          eq(interviewSlotBooking.organizationId, orgId),
          eq(interviewSlotBooking.status, 'cancelled'),
        ))
      return true
    })
  }
  catch {
    return false
  }
}
