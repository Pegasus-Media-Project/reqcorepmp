import { eq } from 'drizzle-orm'
import { application, job } from '../../../database/schema'

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

  const fee = row.applicationFeeEnabled
    ? {
        status: row.feeStatus,
        amount: row.applicationFeeAmount,
        currency: row.applicationFeeCurrency,
        actionUrl: row.applicationFeeUrl,
        awaitingManualVerification: row.feeStatus !== 'verified',
      }
    : null

  const documents = (isAcceptedStage && row.requireSignedDocuments)
    ? {
        status: row.documentsStatus,
        actionUrl: row.signingUrl,
        awaitingManualVerification: row.documentsStatus !== 'verified',
      }
    : null

  return {
    statusKey: row.status,
    status: STATUS_LABELS[row.status] ?? 'Received',
    jobTitle: row.jobTitle,
    submittedAt: row.submittedAt,
    fee,
    documents,
  }
})
