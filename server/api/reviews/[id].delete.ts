import { and, eq } from 'drizzle-orm'
import { review } from '../../database/schema'
import { reviewIdParamSchema } from '../../utils/schemas/review'

/**
 * DELETE /api/reviews/:id
 * Remove a review. Only the original reviewer (or an owner/admin) may delete.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, reviewIdParamSchema.parse)

  const existing = await db.query.review.findFirst({
    where: and(eq(review.id, id), eq(review.organizationId, orgId)),
    columns: { id: true, reviewerId: true },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  }

  // Members/guests can only delete their own; owners/admins may delete any.
  const scope = await getManagedJobScope(session)
  if (!scope.manageAll && existing.reviewerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only delete your own reviews' })
  }

  await db.delete(review).where(eq(review.id, id))

  return { success: true }
})
