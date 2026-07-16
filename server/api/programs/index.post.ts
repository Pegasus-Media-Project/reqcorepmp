import { program } from '../../database/schema'
import { createProgramSchema } from '../../utils/schemas/program'

/**
 * POST /api/programs
 *
 * Create a new program (e.g. a Pegasus cohort) for the active organization.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createProgramSchema.parse)

  const [created] = await db.insert(program).values({
    organizationId: orgId,
    name: body.name,
    description: body.description ?? null,
    archived: body.archived,
  }).returning()

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create program' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'program',
    resourceId: created.id,
    metadata: { name: created.name },
  })

  setResponseStatus(event, 201)
  return { ...created, jobCount: 0 }
})
