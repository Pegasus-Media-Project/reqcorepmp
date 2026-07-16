import { eq, count } from 'drizzle-orm'
import { program, job } from '../../database/schema'

/**
 * GET /api/programs
 *
 * List every program for the active organization, each with the number of
 * jobs currently attached. Ordered newest first.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId

  const rows = await db.query.program.findMany({
    where: eq(program.organizationId, orgId),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  })

  // Attach job counts in a single grouped query.
  const counts = await db
    .select({ programId: job.programId, jobCount: count() })
    .from(job)
    .where(eq(job.organizationId, orgId))
    .groupBy(job.programId)

  const countMap = new Map(counts.map(c => [c.programId, Number(c.jobCount)]))

  return rows.map(p => ({ ...p, jobCount: countMap.get(p.id) ?? 0 }))
})
