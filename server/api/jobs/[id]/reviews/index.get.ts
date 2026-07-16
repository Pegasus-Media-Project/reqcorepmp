import { idParamSchema } from '../../../../utils/schemas/job'
import { buildJobReviewAggregate } from '../../../../utils/reviewAggregate'

/**
 * GET /api/jobs/:id/reviews
 * Per-applicant review aggregates for the Ratings tab: average screening score,
 * average interview score, counts, and per-reviewer breakdown for every
 * applicant on the job. Requires review:read and that the job is in scope.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  await assertJobInScope(session, id)

  return await buildJobReviewAggregate(orgId, id)
})
