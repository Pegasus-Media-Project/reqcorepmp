import { and, eq, gt, lt, ne, sql } from 'drizzle-orm'
import { application, job, interviewSlot, interviewSlotBooking } from '../../../database/schema'
import { buildBookingUrl } from '../../../utils/interview-token'

/**
 * GET /api/public/applications/:code
 *
 * Public application-status lookup by confirmation code. No auth — the code is
 * the secret. Because the code space is small enough to brute-force, this is
 * rate-limited and returns a uniform 404 for both invalid and unknown codes so
 * it can't be used to enumerate valid codes. Returns no candidate PII.
 */

/** Max 10 status checks per IP per 15 minutes — throttles code enumeration. */
const statusCheckRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many status checks. Please try again in a little while.',
})

/** Internal pipeline stage → applicant-facing label (honest full mapping). */
const STATUS_LABELS: Record<string, string> = {
  new: 'Received',
  screening: 'Under review',
  interview: 'Interviewing',
  waitlist: 'Waitlisted',
  offer: 'Offer extended',
  hired: 'Hired',
  rejected: 'Not selected',
}

export default defineEventHandler(async (event) => {
  // Skipped outside production and in CI (mirrors the apply endpoint).
  if (process.env.NODE_ENV === 'production' && !process.env.CI && !process.env.GITHUB_ACTIONS) {
    await statusCheckRateLimit(event)
  }

  const notFound = () =>
    createError({ statusCode: 404, statusMessage: 'No application found for that code' })

  const code = normalizeConfirmationCode(getRouterParam(event, 'code') ?? '')
  if (!isValidConfirmationCode(code)) throw notFound()

  const [row] = await db
    .select({
      applicationId: application.id,
      jobId: application.jobId,
      status: application.status,
      submittedAt: application.createdAt,
      jobTitle: job.title,
      feeStatus: application.feeStatus,
      documentsStatus: application.documentsStatus,
      applicationFeeEnabled: job.applicationFeeEnabled,
      applicationFeeUrl: job.applicationFeeUrl,
      applicationFeeAmount: job.applicationFeeAmount,
      applicationFeeCurrency: job.applicationFeeCurrency,
      requireSignedDocuments: job.requireSignedDocuments,
      signingUrl: job.signingUrl,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(eq(application.confirmationCode, code))
    .limit(1)

  if (!row) throw notFound()

  // Onboarding steps the applicant can see & act on. The fee (submission phase)
  // is visible from the start; signed documents (acceptance phase) only once
  // they've reached the offer/hired stage. No PII is exposed either way.
  const isAcceptedStage = row.status === 'offer' || row.status === 'hired'

  // A waived fee is settled: nothing to pay, nothing to verify.
  const feeSettled = row.feeStatus === 'verified' || row.feeStatus === 'waived'
  const fee = row.applicationFeeEnabled
    ? {
        status: row.feeStatus,
        amount: row.applicationFeeAmount,
        currency: row.applicationFeeCurrency,
        // The pay link is withheld once the fee is settled — see status.vue.
        actionUrl: feeSettled ? null : row.applicationFeeUrl,
        awaitingManualVerification: !feeSettled,
      }
    : null

  const documents = (isAcceptedStage && row.requireSignedDocuments)
    ? {
        status: row.documentsStatus,
        actionUrl: row.signingUrl,
        awaitingManualVerification: row.documentsStatus !== 'verified',
      }
    : null

  // Interview self-scheduling. The confirmation code already proves this is the
  // applicant, so we can mint the same booking token the invitation email
  // carries: they can pick a time (or move the one they picked) straight from
  // here instead of hunting for that email.
  const interview = row.status === 'interview'
    ? await buildInterviewStep(row.applicationId, row.jobId)
    : null

  return {
    statusKey: row.status,
    status: STATUS_LABELS[row.status] ?? 'Received',
    jobTitle: row.jobTitle,
    submittedAt: row.submittedAt,
    fee,
    documents,
    interview,
  }
})

/**
 * The applicant-facing scheduling step: the slot they hold (if any), and a
 * booking link whenever there is something for them to pick from. No PII —
 * just the shared slot's time, place and shape.
 */
async function buildInterviewStep(applicationId: string, jobId: string) {
  // Manual join — the slot tables intentionally declare no Drizzle relations.
  const [booked] = await db
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
      eq(interviewSlotBooking.applicationId, applicationId),
      eq(interviewSlotBooking.status, 'confirmed'),
    ))
    .limit(1)

  // Are there other times to pick? The slot they already hold doesn't count as
  // an alternative, so a lone booked slot correctly reads as "no other times".
  const [available] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewSlot)
    .where(and(
      eq(interviewSlot.jobId, jobId),
      eq(interviewSlot.status, 'open'),
      gt(interviewSlot.startsAt, new Date()),
      lt(interviewSlot.bookedCount, sql`${interviewSlot.capacity}`),
      ...(booked ? [ne(interviewSlot.id, booked.id)] : []),
    ))

  const otherTimesAvailable = (available?.count ?? 0) > 0

  return {
    booked: booked
      ? {
          title: booked.title,
          startsAt: booked.startsAt,
          duration: booked.duration,
          timezone: booked.timezone,
          location: booked.location,
          type: booked.type,
        }
      : null,
    otherTimesAvailable,
    // Relative — same app serves the booking page.
    bookingUrl: otherTimesAvailable
      ? buildBookingUrl('', applicationId, env.BETTER_AUTH_SECRET)
      : null,
  }
}
