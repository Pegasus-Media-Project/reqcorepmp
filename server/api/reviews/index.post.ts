import { and, eq } from 'drizzle-orm'
import { application, review } from '../../database/schema'
import { createReviewSchema } from '../../utils/schemas/review'

/**
 * POST /api/reviews
 * Upsert the current user's rating + notes for one applicant at one stage.
 * One review per (application, reviewer, stage) — re-posting edits in place.
 * Requires review:create permission and that the application's job is in the
 * caller's scope (assigned members + guests, or owner/admin).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createReviewSchema.parse)

  // Resolve the application within the org (prevents IDOR) and its job.
  const app = await db.query.application.findFirst({
    where: and(eq(application.id, body.applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, jobId: true },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  // Scope: 404 if the caller can't manage this application's job.
  await assertApplicationInScope(session, body.applicationId)

  const [saved] = await db
    .insert(review)
    .values({
      organizationId: orgId,
      applicationId: body.applicationId,
      jobId: app.jobId,
      reviewerId: session.user.id,
      stage: body.stage,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [review.organizationId, review.applicationId, review.reviewerId, review.stage],
      set: {
        rating: body.rating ?? null,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      },
    })
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

  if (!saved) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to save review' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application',
    resourceId: body.applicationId,
    metadata: { reviewId: saved.id, stage: saved.stage, rating: saved.rating },
  })

  setResponseStatus(event, 201)
  return saved
})
