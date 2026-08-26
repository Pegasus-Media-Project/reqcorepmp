import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, interview, interviewSlot, interviewSlotBooking, organization } from '../../../database/schema'
import { bookSlotSchema } from '../../../utils/schemas/interviewSlot'
import { verifyBookingToken } from '../../../utils/interview-token'
import { sendBookingConfirmationEmail, getFromEmail } from '../../../utils/email'
import { generateInterviewICS } from '../../../utils/ical'

/**
 * POST /api/public/interview-slots/book  { token, slotId }
 *
 * Public: the invited candidate books a specific open slot. Race-safe — the
 * capacity counter is incremented with a single conditional UPDATE, so only one
 * of N concurrent bookers can claim the last spot. A successful booking
 * materializes a normal `interview` row and records the booking.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bookSlotSchema.parse)

  const payload = verifyBookingToken(body.token, env.BETTER_AUTH_SECRET)
  if (!payload) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired link' })
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

  // Idempotency / one-active-booking guard (before touching capacity).
  // Manual join — the slot tables intentionally declare no Drizzle relations.
  const [existing] = await db
    .select({
      bookedSlotId: interviewSlotBooking.slotId,
      id: interviewSlot.id,
      title: interviewSlot.title,
      startsAt: interviewSlot.startsAt,
      duration: interviewSlot.duration,
      timezone: interviewSlot.timezone,
      location: interviewSlot.location,
      type: interviewSlot.type,
    })
    .from(interviewSlotBooking)
    .innerJoin(interviewSlot, eq(interviewSlotBooking.slotId, interviewSlot.id))
    .where(and(
      eq(interviewSlotBooking.applicationId, app.id),
      eq(interviewSlotBooking.status, 'confirmed'),
    ))
    .limit(1)
  if (existing) {
    if (existing.bookedSlotId === body.slotId) {
      // Same slot → treat as success (idempotent re-submit).
      const { bookedSlotId, ...slot } = existing
      return { success: true, alreadyBooked: true, slot }
    }
    throw createError({ statusCode: 409, statusMessage: 'You already have an interview booked. Refresh to see your booked time.' })
  }

  const result = await db.transaction(async (tx) => {
    // 1. Atomically claim a spot. 0 rows ⇒ slot full / closed / past ⇒ lost race.
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

    // 2. Materialize the interview at the slot's time. Interviewers = the
    // slot's manually typed names + everyone signed up to interview it.
    const mergedInterviewers = mergeInterviewerNames(
      claimed.interviewers,
      await getSlotSignupNames(app.organizationId, claimed.id),
    )
    const [createdInterview] = await tx.insert(interview).values({
      organizationId: app.organizationId,
      applicationId: app.id,
      title: claimed.title,
      type: claimed.type,
      status: 'scheduled',
      scheduledAt: claimed.startsAt,
      duration: claimed.duration,
      location: claimed.location,
      interviewers: mergedInterviewers.length ? mergedInterviewers : null,
      createdById: claimed.createdById,
      candidateResponse: 'accepted',
      candidateRespondedAt: new Date(),
      timezone: claimed.timezone,
      slotId: claimed.id,
    }).returning()

    // 3. Record the booking (unique index prevents a double-book slipping past
    // the pre-check under concurrency).
    try {
      await tx.insert(interviewSlotBooking).values({
        organizationId: app.organizationId,
        slotId: claimed.id,
        applicationId: app.id,
        interviewId: createdInterview!.id,
        status: 'confirmed',
      })
    }
    catch (err: any) {
      if (err?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'You already have an interview booked.' })
      }
      throw err
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
      interviewId: createdInterview!.id,
    }
  })

  // Best-effort confirmation email with an .ics for the chosen time. Failures
  // are logged inside sendEmail and never unwind the committed booking.
  if (app.candidate?.email) {
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
      // Never fail the booking because the confirmation email couldn't send.
    }
  }

  return { success: true, slot: result.slot }
})
