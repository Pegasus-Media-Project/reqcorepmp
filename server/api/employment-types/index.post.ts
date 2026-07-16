import { eq } from 'drizzle-orm'
import { employmentType } from '../../database/schema'
import { createEmploymentTypeSchema } from '../../utils/schemas/employmentType'

/**
 * POST /api/employment-types
 *
 * Add a new employment type to the org's list. Admin/owner only.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createEmploymentTypeSchema.parse)

  // Default new entries to the end of the list.
  const existing = await db.query.employmentType.findMany({
    where: eq(employmentType.organizationId, orgId),
    columns: { displayOrder: true },
  })
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.displayOrder), -1) + 1

  try {
    const [created] = await db.insert(employmentType).values({
      organizationId: orgId,
      label: body.label,
      displayOrder: body.displayOrder ?? nextOrder,
    }).returning()

    setResponseStatus(event, 201)
    return created
  }
  catch (err: unknown) {
    // Unique (organization_id, label) violation → friendly conflict.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'That employment type already exists' })
    }
    throw err
  }
})
