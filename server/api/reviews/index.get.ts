import { and, desc, eq } from 'drizzle-orm'
import { review, user } from '../../database/schema'
import { listReviewQuerySchema } from '../../utils/schemas/review'

/**
 * GET /api/reviews?applicationId=... | ?jobId=...
 * List reviews (all reviewers — open visibility) for one application, or every
 * review for a job. Requires review:read; results are confined to the caller's
 * job scope so members/guests only see reviews on jobs they're assigned to.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['read'] })
  const orgId = session.session.activeOrganizationId

  const query = await getValidatedQuery(event, listReviewQuerySchema.parse)

  // Confirm the single application/job is in scope before returning any rows.
  if (query.applicationId) {
    await assertApplicationInScope(session, query.applicationId)
  }
  else if (query.jobId) {
    await assertJobInScope(session, query.jobId)
  }

  const where = and(
    eq(review.organizationId, orgId),
    query.applicationId ? eq(review.applicationId, query.applicationId) : undefined,
    query.jobId ? eq(review.jobId, query.jobId) : undefined,
  )

  const rows = await db
    .select({
      id: review.id,
      applicationId: review.applicationId,
      jobId: review.jobId,
      stage: review.stage,
      rating: review.rating,
      notes: review.notes,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      reviewerId: review.reviewerId,
      reviewerName: user.name,
      reviewerEmail: user.email,
      reviewerImage: user.image,
    })
    .from(review)
    .innerJoin(user, eq(user.id, review.reviewerId))
    .where(where)
    .orderBy(desc(review.updatedAt))

  return { data: rows }
})
