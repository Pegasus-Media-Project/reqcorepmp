import { and, eq } from 'drizzle-orm'
import { job, jobAssignment, member, user, reviewerInvite } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * GET /api/jobs/:id/guests
 * List active guest reviewers assigned to this job plus any pending guest
 * invitations. Owner/admin only.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // Active guests: assigned to this job AND holding the guest role.
  const active = await db
    .select({
      userId: jobAssignment.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
    })
    .from(jobAssignment)
    .innerJoin(user, eq(user.id, jobAssignment.userId))
    .innerJoin(member, and(eq(member.userId, jobAssignment.userId), eq(member.organizationId, orgId)))
    .where(and(
      eq(jobAssignment.organizationId, orgId),
      eq(jobAssignment.jobId, id),
      eq(member.role, 'guest'),
    ))

  // Pending invitations bound to this job.
  const pending = await db
    .select({ email: reviewerInvite.email, createdAt: reviewerInvite.createdAt })
    .from(reviewerInvite)
    .where(and(
      eq(reviewerInvite.organizationId, orgId),
      eq(reviewerInvite.jobId, id),
      eq(reviewerInvite.status, 'pending'),
    ))

  return { active, pending }
})
