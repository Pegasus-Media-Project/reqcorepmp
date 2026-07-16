import { and, eq } from 'drizzle-orm'
import { program } from '../../database/schema'
import { programIdParamSchema } from '../../utils/schemas/program'

/**
 * DELETE /api/programs/:id
 *
 * Deletes a program. Jobs attached to it survive as standalone (traditional)
 * postings — the FK uses ON DELETE SET NULL. Program assignments cascade away.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['delete'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, programIdParamSchema.parse)

  const [deleted] = await db.delete(program)
    .where(and(eq(program.id, id), eq(program.organizationId, orgId)))
    .returning({ id: program.id, name: program.name })

  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'program',
    resourceId: id,
    metadata: { name: deleted.name },
  })

  setResponseStatus(event, 204)
  return null
})
