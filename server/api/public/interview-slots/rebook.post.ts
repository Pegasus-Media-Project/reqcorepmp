import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, interview, interviewSlot, interviewSlotBooking, organization } from '../../../database/schema'
import { bookSlotSchema } from '../../../utils/schemas/interviewSlot'
import { verifyBookingToken, verifyTestBookingToken } from '../../../utils/interview-token'
import { sendBookingConfirmationEmail, getFromEmail } from '../../../utils/email'
import { generateInterviewICS } from '../../../utils/ical'

/**
 * POST /api/public/interview-slots/rebook  { token, slotId }
 *
 * Public: the candidate moves their confirmed booking to a different open slot.
 * Mirrors the staff reschedule — claim the new slot race-safely, release the old
 * seat, and carry the same booking and interview rows across, so the calendar
 * entry moves (same .ics UID, bumped SEQUENCE) instead of duplicating. Only a
 * still-upcoming interview can be moved; once its time has passed this is the
 * hiring team's call, not a self-service one.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bookSlotSchema.parse)

  const payload = verifyBookingToken(body.token, env.BETTER_AUTH_SECRET)
  if (!payload) {
    // Staff test links validate the move exactly like a real one, then return
    // success WITHOUT writing anything.
    const testPayload = verifyTestBookingToken(body.token, env.BETTER_AUTH_SECRET)
    if (!testPayload) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid or expired link' })
    }
    const testSlot = await db.query.interviewSlot.findFirst({
      where: and(
        eq(interviewSlot.id, body.slotId),
        eq(interviewSlot.jobId, testPayload.jobId),
        eq(interviewSlot.status, 'open'),
        gt(interviewSlot.startsAt, new Date()),
        lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
      ),
      columns: { id: true, title: true, startsAt: true, duration: true, timezone: true, location: true, type: true },
    })
    if (!testSlot) {
      throw createError({ statusCode: 409, statusMessage: 'That time was just taken. Please choose another slot.' })
    }
    return { success: true, test: true, slot: testSlot }
  }

  const app = await db.query.application.findFirst({
    where: eq(application.id, payload.applicationId),
    columns: { id: true, organizationId: true, jobId: true },
    with: {
      candidate: { columns: { firstName: true, lastName: true, email: true } },
      job: { columns: { title: true } },
    },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  // The booking being moved. Manual join — the slot tables intentionally
  // declare no Drizzle relations.
  const [current] = await db
    .select({
      bookingId: interviewSlotBooking.id,
      interviewId: interviewSlotBooking.interviewId,
      slotId: interviewSlot.id,
      startsAt: interviewSlot.startsAt,
    })
    .from(interviewSlotBooking)
    .innerJoin(interviewSlot, eq(interviewSlotBooking.slotId, interviewSlot.id))
    .where(and(
      eq(interviewSlotBooking.applicationId, app.id),
      eq(interviewSlotBooking.status, 'confirmed'),
    ))
    .limit(1)

  if (!current) {
    throw createError({ statusCode: 409, statusMessage: 'You don’t have an interview booked yet. Pick a time instead.' })
  }
  if (current.slotId === body.slotId) {
    throw createError({ statusCode: 409, statusMessage: 'That’s the time you already have booked.' })
  }
  if (new Date(current.startsAt) <= new Date()) {
    throw createError({ statusCode: 409, statusMessage: 'This interview has already started or passed. Please contact the hiring team.' })
  }

  const result = await db.transaction(async (tx) => {
    // 1. Atomically claim the new slot. 0 rows ⇒ full / closed / past.
    const [claimed] = await tx.update(interviewSlot)
      .set({ bookedCount: sql`${interviewSlot.bookedCount} + 1`, updatedAt: new Date() })
      .where(and(
        eq(interviewSlot.id, body.slotId),
        eq(interviewSlot.organizationId, app.organizationId),
        eq(interviewSlot.jobId, app.jobId),
        eq(interviewSlot.status, 'open'),
        gt(interviewSlot.startsAt, new Date()),
        lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
      ))
      .returning()

    if (!claimed) {
      throw createError({ statusCode: 409, statusMessage: 'That time was just taken. Please choose another slot.' })
    }

    // 2. Release the seat they were holding.
    await tx.update(interviewSlot)
      .set({ bookedCount: sql`${interviewSlot.bookedCount} - 1`, updatedAt: new Date() })
      .where(and(eq(interviewSlot.id, current.slotId), gt(interviewSlot.bookedCount, 0)))

    // 3. Carry the booking row across (one row per application, moved — never
    // cancelled and re-inserted, which the (slot, application) unique index
    // would block on a return to a previously held time).
    await tx.update(interviewSlotBooking)
      .set({ slotId: claimed.id, bookedAt: new Date(), updatedAt: new Date() })
      .where(eq(interviewSlotBooking.id, current.bookingId))

    // 4. Move the interview itself. They chose this time, so the response stays
    // accepted; the bumped sequence updates the calendar entry in place.
    let updatedInterview = null
    if (current.interviewId) {
      const interviewers = mergeInterviewerNames(
        claimed.interviewers,
        await getSlotSignupNames(app.organizationId, claimed.id),
      )
      const [row] = await tx.update(interview)
        .set({
          title: claimed.title,
          type: claimed.type,
          scheduledAt: claimed.startsAt,
          duration: claimed.duration,
          timezone: claimed.timezone,
          location: claimed.location,
          interviewers: interviewers.length ? interviewers : null,
          slotId: claimed.id,
          status: 'scheduled',
          candidateResponse: 'accepted',
          candidateRespondedAt: new Date(),
          icsSequence: sql`${interview.icsSequence} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(interview.id, current.interviewId),
          eq(interview.organizationId, app.organizationId),
        ))
        .returning()
      updatedInterview = row ?? null
    }

    return {
      slot: {
        id: claimed.id,
        title: claimed.title,
        startsAt: claimed.startsAt,
        duration: claimed.duration,
        timezone: claimed.timezone,
        location: claimed.location,
        type: claimed.type,
      },
      interviewId: updatedInterview?.id ?? null,
      icsSequence: updatedInterview?.icsSequence ?? 0,
    }
  })

  // Best-effort confirmation for the new time. Failures never unwind the move.
  if (app.candidate?.email && result.interviewId) {
    const startsAt = new Date(result.slot.startsAt)
    const tz = result.slot.timezone ?? 'UTC'
    const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim()
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, app.organizationId),
      columns: { name: true },
    })
    const orgName = org?.name?.trim() || 'Pegasus Media Project'
    const fromEmail = getFromEmail()
    try {
      const icsContent = generateInterviewICS({
        interviewId: result.interviewId,
        summary: `${result.slot.title} — ${app.job?.title ?? orgName}`,
        description: [
          `Interview: ${result.slot.title}`,
          ...(app.job?.title ? [`Position: ${app.job.title}`] : []),
          `Duration: ${result.slot.duration} minutes`,
          ...(result.slot.location ? [`Location: ${result.slot.location}`] : []),
        ].join('\n'),
        startTime: startsAt,
        durationMinutes: result.slot.duration,
        location: result.slot.location,
        organizerName: orgName,
        organizerEmail: fromEmail.replace(/^.*</, '').replace(/>$/, ''),
        attendeeEmail: app.candidate.email,
        attendeeName: candidateName,
        sequence: result.icsSequence,
      })
      await sendBookingConfirmationEmail({
        to: app.candidate.email,
        candidateFirstName: app.candidate.firstName,
        jobTitle: app.job?.title ?? '',
        organizationName: orgName,
        interviewTitle: result.slot.title,
        interviewDate: startsAt.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz,
        }),
        interviewTime: startsAt.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
        }),
        interviewLocation: result.slot.location,
        icsContent,
      })
    }
    catch {
      // Never fail the move because the confirmation email couldn't send.
    }
  }

  return { success: true, slot: result.slot }
})
