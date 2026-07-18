import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { organization, job } from '../../../../database/schema'
import { idParamSchema } from '../../../../utils/schemas/job'
import { loadApplicationsForPdf, buildApplicationsPdfHtml, MAX_PDF_BATCH } from '../../../../utils/application-pdf'
import { renderHtmlToPdf } from '../../../../utils/pdf'

const exportQuerySchema = z.object({
  status: z.enum(['new', 'screening', 'interview', 'waitlist', 'offer', 'hired', 'rejected']).optional(),
})

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'job'
}

/**
 * GET /api/jobs/:id/applications/export.pdf?status=…
 * Download all applications for a job as a single PDF — one summary page per
 * application, optionally filtered by pipeline status. Requires application:read
 * and that the job is in scope. Capped at MAX_PDF_BATCH applications.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const { status } = await getValidatedQuery(event, exportQuerySchema.parse)

  await assertJobInScope(session, id)

  const apps = await loadApplicationsForPdf({
    orgId,
    jobId: id,
    statuses: status ? [status] : undefined,
    limit: MAX_PDF_BATCH + 1,
  })

  if (!apps.length) {
    throw createError({ statusCode: 404, statusMessage: 'No applications to export' })
  }
  if (apps.length > MAX_PDF_BATCH) {
    throw createError({
      statusCode: 413,
      statusMessage: `Too many applications to export at once (limit ${MAX_PDF_BATCH}). Narrow the results with a status filter.`,
    })
  }

  const [org, jobRow] = await Promise.all([
    db.query.organization.findFirst({ where: eq(organization.id, orgId), columns: { name: true } }),
    db.query.job.findFirst({ where: eq(job.id, id), columns: { title: true } }),
  ])

  const html = buildApplicationsPdfHtml(apps, { orgName: org?.name })
  const pdf = await renderHtmlToPdf(html)

  const base = slugify(jobRow?.title ?? 'job')
  const suffix = status ? `-${status}` : ''

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${base}${suffix}-applications.pdf"`,
  })
  return pdf
})
