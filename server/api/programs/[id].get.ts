import { and, eq, count } from 'drizzle-orm'
import { program, job } from '../../database/schema'
import { programIdParamSchema } from '../../utils/schemas/program'

/**
 * GET /api/programs/:id — fetch a single program with its job count.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, programIdParamSchema.parse)

  const row = await db.query.program.findFirst({
    where: and(eq(program.id, id), eq(program.organizationId, orgId)),
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  const [jobCountRow] = await db
    .select({ jobCount: count() })
    .from(job)
    .where(and(eq(job.organizationId, orgId), eq(job.programId, id)))

  return { ...row, jobCount: Number(jobCountRow?.jobCount ?? 0) }
})
