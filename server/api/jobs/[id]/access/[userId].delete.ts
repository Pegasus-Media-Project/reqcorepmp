import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { jobAssignment } from '../../../../database/schema'

const paramsSchema = z.object({ id: z.string().min(1), userId: z.string().min(1) })

/**
 * DELETE /api/jobs/:id/access/:userId — remove an individual job assignment.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id, userId } = await getValidatedRouterParams(event, paramsSchema.parse)

  await db.delete(jobAssignment).where(and(
    eq(jobAssignment.jobId, id),
    eq(jobAssignment.userId, userId),
    eq(jobAssignment.organizationId, orgId),
  ))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: { unassignedUserId: userId },
  })

  setResponseStatus(event, 204)
  return null
})
