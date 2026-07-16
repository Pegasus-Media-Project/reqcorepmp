import { and, eq } from 'drizzle-orm'
import { program } from '../../database/schema'
import { programIdParamSchema, updateProgramSchema } from '../../utils/schemas/program'

/**
 * PATCH /api/programs/:id — update a program's name/description/archived flag.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, programIdParamSchema.parse)
  const body = await readValidatedBody(event, updateProgramSchema.parse)

  const existing = await db.query.program.findFirst({
    where: and(eq(program.id, id), eq(program.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description ?? null
  if (body.archived !== undefined) updates.archived = body.archived

  const [updated] = await db.update(program)
    .set(updates)
    .where(and(eq(program.id, id), eq(program.organizationId, orgId)))
    .returning()

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'program',
    resourceId: id,
    metadata: { name: updated!.name },
  })

  return updated
})
