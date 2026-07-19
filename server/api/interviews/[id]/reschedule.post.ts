import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, interview, interviewSlot, interviewSlotBooking, organization } from '../../../database/schema'
import { interviewIdParamSchema } from '../../../utils/schemas/interview'
import { rescheduleInterviewSchema } from '../../../utils/schemas/interviewSlot'
import {
  sendInterviewInvitationEmail,
  DEFAULT_RESCHEDULE_SUBJECT,
  DEFAULT_RESCHEDULE_BODY,
  getFromEmail,
  type InterviewEmailData,
} from '../../../utils/email'
import { generateInterviewICS } from '../../../utils/ical'
import { buildResponseUrls } from '../../../utils/interview-token'
import { updateCalendarEvent } from '../../../utils/google-calendar'

const interviewTypeLabels: Record<string, string> = {
  video: 'Video Call',
  phone: 'Phone Call',
  in_person: 'In Person',
  technical: 'Technical Interview',
  panel: 'Panel Interview',
  take_home: 'Take-Home Assignment',
}

/**
 * POST /api/interviews/:id/reschedule  { slotId } | { startsAt, duration?, timezone? }
 *
 * Slot-aware reschedule: the interview moves onto an open block (race-safe
 * claim), or onto a one-off time — which materializes a matching single-seat
 * block so the job's availability stays truthful. The old block's seat is
 * released. The candidate gets an updated email whose .ics shares the original
 * UID with a bumped SEQUENCE, so their calendar entry moves instead of
 * duplicating; their response resets to pending for the new time.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)
  const body = await readValidatedBody(event, rescheduleInterviewSchema.parse)

  const current = await db.query.interview.findFirst({
    where: and(eq(interview.id, id), eq(interview.organizationId, orgId)),
  })
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  }
  if (current.status === 'completed') {
    throw createError({ statusCode: 400, statusMessage: 'A completed interview cannot be rescheduled' })
  }

  const app = await db.query.application.findFirst({
    where: eq(application.id, current.applicationId),
    columns: { id: true, jobId: true },
    with: {
      candidate: { columns: { firstName: true, lastName: true, email: true } },
      job: { columns: { title: true } },
    },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }
  await assertApplicationInScope(session, app.id)

  // The candidate knew the old time if they were invited or booked it themselves.
  const candidateWasNotified = !!current.invitationSentAt || !!current.slotId || current.candidateResponse !== 'pending'

  const updated = await db.transaction(async (tx) => {
    // 1. Claim the target block.
    let target
    if (body.slotId) {
      const [claimed] = await tx.update(interviewSlot)
        .set({ bookedCount: sql`${interviewSlot.bookedCount} + 1`, updatedAt: new Date() })
        .where(and(
          eq(interviewSlot.id, body.slotId),
          eq(interviewSlot.organizationId, orgId),
          eq(interviewSlot.jobId, app.jobId),
          eq(interviewSlot.status, 'open'),
          gt(interviewSlot.startsAt, new Date()),
          lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
        ))
        .returning()
      if (!claimed) {
        throw createError({ statusCode: 409, statusMessage: 'That block was just taken or closed. Pick another.' })
      }
      target = claimed
    }
    else {
      // One-off time → materialize a matching, already-full block.
      const [created] = await tx.insert(interviewSlot).values({
        organizationId: orgId,
        jobId: app.jobId,
        createdById: session.user.id,
        title: current.title,
        type: current.type,
        startsAt: new Date(body.startsAt!),
        duration: body.duration ?? current.duration,
        timezone: body.timezone ?? current.timezone,
        location: current.location,
        capacity: 1,
        bookedCount: 1,
      }).returning()
      target = created!
    }

    // 2. Release the old block's seat.
    if (current.slotId && current.slotId !== target.id) {
      await tx.update(interviewSlot)
        .set({ bookedCount: sql`${interviewSlot.bookedCount} - 1`, updatedAt: new Date() })
        .where(and(eq(interviewSlot.id, current.slotId), gt(interviewSlot.bookedCount, 0)))
    }

    // 3. Move the booking row along, when this interview came from a booking.
    await tx.update(interviewSlotBooking)
      .set({ slotId: target.id, updatedAt: new Date() })
      .where(and(
        eq(interviewSlotBooking.interviewId, id),
        eq(interviewSlotBooking.status, 'confirmed'),
      ))

    // 4. Move the interview itself; response resets for the new time.
    const [row] = await tx.update(interview)
      .set({
        scheduledAt: target.startsAt,
        duration: target.duration,
        timezone: target.timezone,
        slotId: target.id,
        status: 'scheduled',
        candidateResponse: 'pending',
        candidateRespondedAt: null,
        icsSequence: sql`${interview.icsSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
      .returning()
    return row!
  })

  // ── Post-commit, best-effort side effects ─────────────────────────────────

  // Google Calendar: move the synced event.
  if (current.googleCalendarEventId) {
    updateCalendarEvent(current.createdById, current.googleCalendarEventId, {
      startTime: new Date(updated.scheduledAt),
      durationMinutes: updated.duration,
      timezone: updated.timezone ?? 'UTC',
      ...(app.candidate ? {
        candidateEmail: app.candidate.email,
        candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`,
      } : {}),
    }).catch((err) => {
      logError('calendar.update_event_failed', {
        event_id: current.googleCalendarEventId,
        error_message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  // Updated email + versioned .ics — only if the candidate knew the old time.
  let emailSent = false
  if (candidateWasNotified && app.candidate?.email) {
    try {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, orgId),
        columns: { name: true },
      })
      const orgName = org?.name?.trim() || 'Pegasus Media Project'
      const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim()
      const scheduledAt = new Date(updated.scheduledAt)
      const tz = updated.timezone ?? 'UTC'
      const fromEmail = getFromEmail()

      const baseUrl = env.BETTER_AUTH_URL
        || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
        || getRequestURL(event).origin
        || 'https://reqcore.com'
      const responseUrls = buildResponseUrls(baseUrl, id, env.BETTER_AUTH_SECRET)

      const icsContent = generateInterviewICS({
        interviewId: id,
        summary: `${updated.title} — ${app.job?.title ?? orgName}`,
        description: [
          `Interview: ${updated.title}`,
          ...(app.job?.title ? [`Position: ${app.job.title}`] : []),
          `Duration: ${updated.duration} minutes`,
          ...(updated.location ? [`Location: ${updated.location}`] : []),
          '',
          `Respond: ${responseUrls.accepted}`,
        ].join('\n'),
        startTime: scheduledAt,
        durationMinutes: updated.duration,
        location: updated.location,
        organizerName: orgName,
        organizerEmail: fromEmail.replace(/^.*</, '').replace(/>$/, ''),
        attendeeEmail: app.candidate.email,
        attendeeName: candidateName,
        sequence: updated.icsSequence,
      })

      const emailData: InterviewEmailData = {
        candidateName,
        candidateFirstName: app.candidate.firstName,
        candidateLastName: app.candidate.lastName,
        candidateEmail: app.candidate.email,
        jobTitle: app.job?.title ?? '',
        interviewTitle: updated.title,
        interviewDate: scheduledAt.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz,
        }),
        interviewTime: scheduledAt.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
        }),
        interviewDuration: updated.duration,
        interviewType: interviewTypeLabels[updated.type] ?? updated.type,
        interviewLocation: updated.location,
        interviewers: updated.interviewers as string[] | null,
        organizationName: orgName,
        responseUrls,
        icsContent,
      }

      await sendInterviewInvitationEmail({
        subject: DEFAULT_RESCHEDULE_SUBJECT,
        body: DEFAULT_RESCHEDULE_BODY,
        data: emailData,
      })
      emailSent = true

      await db.update(interview)
        .set({ invitationSentAt: new Date() })
        .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
    }
    catch (err) {
      logError('email.reschedule_notification_failed', {
        interview_id: id,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'interview',
    resourceId: id,
    metadata: {
      action: 'rescheduled',
      from: current.scheduledAt,
      to: updated.scheduledAt,
      viaSlot: !!body.slotId,
      emailSent,
    },
  })

  return { success: true, interview: updated, emailSent }
})
