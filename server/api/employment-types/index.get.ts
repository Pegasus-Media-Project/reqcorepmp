import { eq } from 'drizzle-orm'
import { employmentType } from '../../database/schema'

/**
 * GET /api/employment-types
 *
 * List the org-configurable employment types, ordered for display. Readable by
 * anyone in the org (the job form's picker needs it).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['read'] })
  const orgId = session.session.activeOrganizationId

  return db.query.employmentType.findMany({
    where: eq(employmentType.organizationId, orgId),
    orderBy: (t, { asc }) => [asc(t.displayOrder), asc(t.createdAt)],
  })
})
