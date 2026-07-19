import { and, eq } from 'drizzle-orm'
import { jobInterviewAvailability } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * GET /api/jobs/:id/interview-availability
 * The job's self-scheduling availability settings, or `{ availability: null }`
 * when none have been saved yet.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  await assertJobInScope(session, id)

  const availability = await db.query.jobInterviewAvailability.findFirst({
    where: and(
      eq(jobInterviewAvailability.jobId, id),
      eq(jobInterviewAvailability.organizationId, orgId),
    ),
  })

  return { availability: availability ?? null }
})
