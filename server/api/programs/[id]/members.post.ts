import { and, eq } from 'drizzle-orm'
import { program, programAssignment, member } from '../../../database/schema'
import { programIdParamSchema, assignUserSchema } from '../../../utils/schemas/program'

/**
 * POST /api/programs/:id/members
 *
 * Assign a user to manage this program. The user must already be a member of
 * the organization. Idempotent — re-assigning an existing user is a no-op.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, programIdParamSchema.parse)
  const body = await readValidatedBody(event, assignUserSchema.parse)

  const existing = await db.query.program.findFirst({
    where: and(eq(program.id, id), eq(program.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  // Only users who already belong to the organization can be assigned.
  const orgMember = await db.query.member.findFirst({
    where: and(eq(member.userId, body.userId), eq(member.organizationId, orgId)),
    columns: { id: true },
  })
  if (!orgMember) throw createError({ statusCode: 422, statusMessage: 'User is not a member of this organization' })

  await db.insert(programAssignment).values({
    organizationId: orgId,
    programId: id,
    userId: body.userId,
  }).onConflictDoNothing()

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'program',
    resourceId: id,
    metadata: { assignedUserId: body.userId },
  })

  setResponseStatus(event, 201)
  return { success: true }
})
