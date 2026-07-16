import { and, eq, inArray, or } from 'drizzle-orm'
import { job, jobAssignment, programAssignment, member, user } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * GET /api/jobs/:id/reviewers
 * The pool of users who can review this job — owners/admins plus members and
 * guests assigned to it (individually or via its program). Populates the
 * interview reviewer picker. Requires interview:read and job scope.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  await assertJobInScope(session, id)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true, programId: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // Users individually assigned to the job, or via its program.
  const jobAssignees = await db
    .select({ userId: jobAssignment.userId })
    .from(jobAssignment)
    .where(and(eq(jobAssignment.organizationId, orgId), eq(jobAssignment.jobId, id)))
  const programAssignees = jobRow.programId
    ? await db
        .select({ userId: programAssignment.userId })
        .from(programAssignment)
        .where(and(eq(programAssignment.organizationId, orgId), eq(programAssignment.programId, jobRow.programId)))
    : []

  const assignedIds = new Set<string>([
    ...jobAssignees.map(r => r.userId),
    ...programAssignees.map(r => r.userId),
  ])

  // owner/admin can review any job; assigned members/guests can review this one.
  const rows = await db
    .select({
      userId: member.userId,
      role: member.role,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(
      eq(member.organizationId, orgId),
      assignedIds.size > 0
        ? or(inArray(member.role, ['owner', 'admin']), inArray(member.userId, [...assignedIds]))
        : inArray(member.role, ['owner', 'admin']),
    ))

  const data = rows.map(r => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    image: r.image,
    role: r.role,
    isGuest: r.role === 'guest',
  }))

  return { data }
})
