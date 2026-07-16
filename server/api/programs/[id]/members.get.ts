import { and, eq } from 'drizzle-orm'
import { program, programAssignment } from '../../../database/schema'
import { programIdParamSchema } from '../../../utils/schemas/program'

/**
 * GET /api/programs/:id/members
 *
 * List the users assigned to manage this program.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, programIdParamSchema.parse)

  const existing = await db.query.program.findFirst({
    where: and(eq(program.id, id), eq(program.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  const rows = await db.query.programAssignment.findMany({
    where: and(eq(programAssignment.programId, id), eq(programAssignment.organizationId, orgId)),
    with: {
      user: { columns: { id: true, name: true, email: true, image: true } },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })

  return rows.map(r => ({
    userId: r.userId,
    createdAt: r.createdAt,
    user: r.user,
  }))
})
