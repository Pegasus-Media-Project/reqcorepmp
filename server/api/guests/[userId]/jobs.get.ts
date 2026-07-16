import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { jobAssignment } from '../../../database/schema'

const paramsSchema = z.object({ userId: z.string().min(1) })

/**
 * GET /api/guests/:userId/jobs
 * The job ids a guest is currently assigned to (owner/admin only). Powers the
 * central job-access editor's prechecked state.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { userId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const rows = await db
    .select({ jobId: jobAssignment.jobId })
    .from(jobAssignment)
    .where(and(eq(jobAssignment.organizationId, orgId), eq(jobAssignment.userId, userId)))

  return { assignedJobIds: rows.map(r => r.jobId) }
})
