import { and, eq } from 'drizzle-orm'
import { employmentType } from '../../database/schema'

/**
 * DELETE /api/employment-types/:id
 *
 * Remove an employment type from the org's list. Admin/owner only.
 * Existing jobs keep their stored label; only the picker option is removed.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId
  const id = getRouterParam(event, 'id')!

  const [deleted] = await db.delete(employmentType)
    .where(and(eq(employmentType.id, id), eq(employmentType.organizationId, orgId)))
    .returning({ id: employmentType.id })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Employment type not found' })
  }

  setResponseStatus(event, 204)
  return null
})
