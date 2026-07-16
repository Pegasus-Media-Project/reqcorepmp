import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { programAssignment } from '../../../../database/schema'

const paramsSchema = z.object({ id: z.string().min(1), userId: z.string().min(1) })

/**
 * DELETE /api/programs/:id/members/:userId — unassign a user from a program.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id, userId } = await getValidatedRouterParams(event, paramsSchema.parse)

  await db.delete(programAssignment).where(and(
    eq(programAssignment.programId, id),
    eq(programAssignment.userId, userId),
    eq(programAssignment.organizationId, orgId),
  ))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'program',
    resourceId: id,
    metadata: { unassignedUserId: userId },
  })

  setResponseStatus(event, 204)
  return null
})
