import { eq } from 'drizzle-orm'
import { organization } from '../../../database/schema'
import { applicationIdParamSchema } from '../../../utils/schemas/application'
import { loadApplicationsForPdf, buildApplicationsPdfHtml } from '../../../utils/application-pdf'
import { renderHtmlToPdf } from '../../../utils/pdf'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'application'
}

/**
 * GET /api/applications/:id/export.pdf
 * Download a single application as a PDF (summary page + full detail).
 * Requires application:read and that the application is in scope.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)

  await assertApplicationInScope(session, id)

  const apps = await loadApplicationsForPdf({ orgId, applicationId: id, limit: 1 })
  if (!apps.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true },
  })

  const html = buildApplicationsPdfHtml(apps, { orgName: org?.name })
  const pdf = await renderHtmlToPdf(html)

  const c = apps[0]!.candidate
  const base = `${c?.firstName ?? ''}-${c?.lastName ?? ''}`.trim()

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${slugify(base)}-application.pdf"`,
  })
  return pdf
})
