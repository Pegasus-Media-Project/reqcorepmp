import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { application, candidate, job, organization, interviewSlot, interviewSlotBooking } from '../../../database/schema'
import { publicSlotsQuerySchema } from '../../../utils/schemas/interviewSlot'
import { verifyBookingToken } from '../../../utils/interview-token'

/**
 * GET /api/public/interview-slots?token=…
 *
 * Public: given a valid booking token, return the available (non-full, open,
 * future) interview slots for the invited application's job — plus whether this
 * application already holds a confirmed booking. No auth: the HMAC-signed token
 * is the proof of authorization. No candidate PII beyond first name.
 */
export default defineEventHandler(async (event) => {
  const { token } = await getValidatedQuery(event, publicSlotsQuerySchema.parse)

  const payload = verifyBookingToken(token, env.BETTER_AUTH_SECRET)
  if (!payload) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired link' })
  }

  const app = await db.query.application.findFirst({
    where: eq(application.id, payload.applicationId),
    columns: { id: true, organizationId: true, jobId: true },
    with: {
      candidate: { columns: { firstName: true } },
      job: { columns: { title: true } },
    },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, app.organizationId),
    columns: { name: true },
  })

  // Does this application already have a confirmed booking? (manual join — the
  // slot tables intentionally declare no Drizzle relations, see schema note.)
  const [existingBooking] = await db
    .select({
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

  // Available slots for this job (open, in the future, and not full).
  const slots = existingBooking
    ? []
    : await db.query.interviewSlot.findMany({
        where: and(
          eq(interviewSlot.organizationId, app.organizationId),
          eq(interviewSlot.jobId, app.jobId),
          eq(interviewSlot.status, 'open'),
          gt(interviewSlot.startsAt, new Date()),
          lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
        ),
        columns: { id: true, title: true, startsAt: true, duration: true, timezone: true, location: true, type: true },
        orderBy: (s, { asc }) => [asc(s.startsAt)],
      })

  return {
    candidateFirstName: app.candidate?.firstName ?? null,
    jobTitle: app.job?.title ?? null,
    organizationName: org?.name ?? null,
    alreadyBooked: existingBooking
      ? { slot: existingBooking }
      : null,
    slots,
  }
})
