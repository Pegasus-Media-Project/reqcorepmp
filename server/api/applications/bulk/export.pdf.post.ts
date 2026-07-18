import { eq } from 'drizzle-orm'
import { organization } from '../../../database/schema'
import { bulkExportSchema } from '../../../utils/schemas/application'
import { loadApplicationsForPdf, buildApplicationsPdfHtml } from '../../../utils/application-pdf'
import { renderHtmlToPdf } from '../../../utils/pdf'

/**
 * POST /api/applications/bulk/export.pdf  { applicationIds }
 *
 * Download a hand-picked set of applications as a single PDF — one summary page
 * per application. POST (not GET) because a multi-select can carry hundreds of
 * IDs; like `bulk/email`, the path deliberately sits below `bulk/` so it can't
 * join the typed-fetch union for /api/applications/:id.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, bulkExportSchema.parse)

  const apps = await loadApplicationsForPdf({
    orgId,
    applicationIds: body.applicationIds,
    limit: body.applicationIds.length,
  })
  if (!apps.length) {
    throw createError({ statusCode: 404, statusMessage: 'No applications to export' })
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true },
  })

  const html = buildApplicationsPdfHtml(apps, { orgName: org?.name })
  const pdf = await renderHtmlToPdf(html)

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="applications-export.pdf"`,
  })
  return pdf
})
