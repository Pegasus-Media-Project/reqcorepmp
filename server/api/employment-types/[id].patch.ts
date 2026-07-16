import { and, eq } from 'drizzle-orm'
import { employmentType } from '../../database/schema'
import { updateEmploymentTypeSchema } from '../../utils/schemas/employmentType'

/**
 * PATCH /api/employment-types/:id
 *
 * Rename or reorder an employment type. Admin/owner only.
 * Renaming does not rewrite existing jobs — their `type` label is independent.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId
  const id = getRouterParam(event, 'id')!

  const body = await readValidatedBody(event, updateEmploymentTypeSchema.parse)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.label !== undefined) updates.label = body.label
  if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder

  try {
    const [updated] = await db.update(employmentType)
      .set(updates)
      .where(and(eq(employmentType.id, id), eq(employmentType.organizationId, orgId)))
      .returning()

    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Employment type not found' })
    }
    return updated
  }
  catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'That employment type already exists' })
    }
    throw err
  }
})
