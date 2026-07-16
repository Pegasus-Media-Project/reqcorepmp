import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { jobAssignment, member } from '../../database/schema'

const paramsSchema = z.object({ userId: z.string().min(1) })

/**
 * DELETE /api/guests/:userId
 * Remove a guest reviewer entirely (owner/admin only): delete all of their job
 * assignments in this org and remove their org membership. Only guests may be
 * removed this way — refuses non-guest members as a safety guard.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { userId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, orgId)),
    columns: { id: true, role: true },
  })
  if (!membership) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }
  if (membership.role !== 'guest') {
    throw createError({ statusCode: 422, statusMessage: 'Only guest reviewers can be removed here' })
  }

  await db.delete(jobAssignment).where(and(
    eq(jobAssignment.organizationId, orgId),
    eq(jobAssignment.userId, userId),
  ))
  await db.delete(member).where(eq(member.id, membership.id))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'member_removed',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { guestRemovedUserId: userId },
  })

  setResponseStatus(event, 204)
  return null
})
