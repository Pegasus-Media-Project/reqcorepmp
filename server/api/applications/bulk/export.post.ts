import { and, eq, inArray, desc } from 'drizzle-orm'
import { application, candidate, organization } from '../../../database/schema'
import { applicationExportSchema, MAX_EXPORT_ROWS } from '../../../utils/schemas/export'
import { buildApplicationFilterConditions } from '../../../utils/applicationFilters'
import { loadApplicationsForPdf, buildApplicationsPdfHtml } from '../../../utils/application-pdf'
import { buildApplicationsWorkbook } from '../../../utils/exports/applicationsWorkbook'
import { renderHtmlToPdf } from '../../../utils/pdf'

/**
 * POST /api/applications/bulk/export  { format, applicationIds? | filters? }
 *
 * One export for both shapes the UI offers: a hand-picked set of applicants, or
 * everything matching the list's current filters. POST rather than GET because
 * a multi-select carries hundreds of ids, and the filter set includes the
 * JSON-encoded property filters. Like `bulk/email`, it sits below `bulk/` so it
 * can't join the typed-fetch union for /api/applications/:id.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, applicationExportSchema.parse)

  const scope = await getManagedJobScope(session)
  const scopeCondition = jobScopeCondition(scope, application.jobId)

  // Resolve which applications to export, always within the caller's job scope.
  let applicationIds: string[]
  if (body.applicationIds?.length) {
    const conditions = [
      eq(application.organizationId, orgId),
      inArray(application.id, body.applicationIds),
    ]
    if (scopeCondition) conditions.push(scopeCondition)
    const rows = await db
      .select({ id: application.id })
      .from(application)
      .where(and(...conditions))
    applicationIds = rows.map(r => r.id)
  }
  else {
    const conditions = [eq(application.organizationId, orgId)]
    if (scopeCondition) conditions.push(scopeCondition)
    const { conditions: filterConditions, noMatches } = await buildApplicationFilterConditions({
      orgId,
      query: body.filters ?? {},
    })
    conditions.push(...filterConditions)

    const rows = noMatches
      ? []
      : await db
          .select({ id: application.id })
          .from(application)
          .innerJoin(candidate, eq(candidate.id, application.candidateId))
          .where(and(...conditions))
          .orderBy(desc(application.createdAt))
          .limit(MAX_EXPORT_ROWS + 1)
    applicationIds = rows.map(r => r.id)
  }

  if (!applicationIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'No applications to export' })
  }
  if (applicationIds.length > MAX_EXPORT_ROWS) {
    throw createError({
      statusCode: 413,
      statusMessage: `Too many applications to export at once (limit ${MAX_EXPORT_ROWS}). Narrow the results with a filter, or select the ones you need.`,
    })
  }

  const apps = await loadApplicationsForPdf({ orgId, applicationIds, limit: applicationIds.length })
  if (!apps.length) {
    throw createError({ statusCode: 404, statusMessage: 'No applications to export' })
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true },
  })

  if (body.format === 'xlsx') {
    const workbook = await buildApplicationsWorkbook(apps, { orgName: org?.name })
    setResponseHeaders(event, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="applications-export.xlsx"',
    })
    return workbook
  }

  const html = buildApplicationsPdfHtml(apps, { orgName: org?.name })
  const pdf = await renderHtmlToPdf(html)
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="applications-export.pdf"',
  })
  return pdf
})
