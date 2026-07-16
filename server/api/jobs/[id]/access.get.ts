import { and, eq } from 'drizzle-orm'
import { job, jobAssignment } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * GET /api/jobs/:id/access
 *
 * List the users individually assigned to manage this job (independent of any
 * program-level assignment). Admin/owner only.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  const existing = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const rows = await db.query.jobAssignment.findMany({
    where: and(eq(jobAssignment.jobId, id), eq(jobAssignment.organizationId, orgId)),
    with: {
      user: { columns: { id: true, name: true, email: true, image: true } },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })

  return rows.map(r => ({ userId: r.userId, createdAt: r.createdAt, user: r.user }))
})
