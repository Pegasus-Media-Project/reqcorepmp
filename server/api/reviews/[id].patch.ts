import { and, eq } from 'drizzle-orm'
import { review } from '../../database/schema'
import { reviewIdParamSchema, updateReviewSchema } from '../../utils/schemas/review'

/**
 * PATCH /api/reviews/:id
 * Update a review's rating/notes. Only the original reviewer may edit theirs.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, reviewIdParamSchema.parse)
  const body = await readValidatedBody(event, updateReviewSchema.parse)

  const existing = await db.query.review.findFirst({
    where: and(eq(review.id, id), eq(review.organizationId, orgId)),
    columns: { id: true, reviewerId: true },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  }
  if (existing.reviewerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only edit your own reviews' })
  }

  const set: { rating?: number | null, notes?: string | null, updatedAt: Date } = { updatedAt: new Date() }
  if (body.rating !== undefined) set.rating = body.rating ?? null
  if (body.notes !== undefined) set.notes = body.notes ?? null

  const [updated] = await db
    .update(review)
    .set(set)
    .where(eq(review.id, id))
    .returning({
      id: review.id,
      applicationId: review.applicationId,
      jobId: review.jobId,
      reviewerId: review.reviewerId,
      stage: review.stage,
      rating: review.rating,
      notes: review.notes,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    })

  return updated
})
