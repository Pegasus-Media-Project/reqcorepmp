import { and, eq } from 'drizzle-orm'
import { job, jobAssignment, member } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { assignUserSchema } from '../../../utils/schemas/program'

/**
 * POST /api/jobs/:id/access
 *
 * Assign a user to manage this individual job. The user must already be a
 * member of the organization. Idempotent. Admin/owner only.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, assignUserSchema.parse)

  const existing = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const orgMember = await db.query.member.findFirst({
    where: and(eq(member.userId, body.userId), eq(member.organizationId, orgId)),
    columns: { id: true },
  })
  if (!orgMember) throw createError({ statusCode: 422, statusMessage: 'User is not a member of this organization' })

  await db.insert(jobAssignment).values({
    organizationId: orgId,
    jobId: id,
    userId: body.userId,
  }).onConflictDoNothing()

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: { assignedUserId: body.userId },
  })

  setResponseStatus(event, 201)
  return { success: true }
})
