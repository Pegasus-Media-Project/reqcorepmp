import { and, asc, eq, inArray } from 'drizzle-orm'
import { interview, application, candidate, job, organization } from '../../../database/schema'
import { interviewExportSchema, MAX_EXPORT_ROWS } from '../../../utils/schemas/export'
import { buildInterviewsWorkbook, buildInterviewsHtml, type InterviewExportRow } from '../../../utils/exports/interviewsExport'
import { renderHtmlToPdf } from '../../../utils/pdf'

/**
 * POST /api/interviews/bulk/export  { format, interviewIds? , jobId? }
 *
 * Export the interview schedule as a spreadsheet or a printable day sheet.
 * With `interviewIds` it exports just those (the board's day selection sends
 * every interview on the chosen days); without, it exports the whole schedule,
 * optionally narrowed to one job.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, interviewExportSchema.parse)

  const scope = await getManagedJobScope(session)
  const scopeCondition = jobScopeCondition(scope, application.jobId)

  const conditions = [eq(interview.organizationId, orgId)]
  if (scopeCondition) conditions.push(scopeCondition)
  if (body.interviewIds?.length) conditions.push(inArray(interview.id, body.interviewIds))
  if (body.jobId) conditions.push(eq(application.jobId, body.jobId))

  const rows = await db
    .select({
      id: interview.id,
      title: interview.title,
      type: interview.type,
      status: interview.status,
      scheduledAt: interview.scheduledAt,
      duration: interview.duration,
      location: interview.location,
      interviewers: interview.interviewers,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobTitle: job.title,
    })
    .from(interview)
    .innerJoin(application, eq(application.id, interview.applicationId))
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .innerJoin(job, eq(job.id, application.jobId))
    .where(and(...conditions))
    .orderBy(asc(interview.scheduledAt))
    .limit(MAX_EXPORT_ROWS + 1)

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'No interviews to export' })
  }
  if (rows.length > MAX_EXPORT_ROWS) {
    throw createError({
      statusCode: 413,
      statusMessage: `Too many interviews to export at once (limit ${MAX_EXPORT_ROWS}). Select the days you need.`,
    })
  }

  const exportRows: InterviewExportRow[] = rows.map(row => ({
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    scheduledAt: row.scheduledAt,
    duration: row.duration,
    location: row.location,
    interviewers: row.interviewers ?? null,
    candidateName: `${row.candidateFirstName ?? ''} ${row.candidateLastName ?? ''}`.trim(),
    candidateEmail: row.candidateEmail ?? '',
    jobTitle: row.jobTitle ?? '',
  }))

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true },
  })

  if (body.format === 'xlsx') {
    const workbook = await buildInterviewsWorkbook(exportRows, { orgName: org?.name })
    setResponseHeaders(event, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="interviews-export.xlsx"',
    })
    return workbook
  }

  const pdf = await renderHtmlToPdf(buildInterviewsHtml(exportRows, { orgName: org?.name }))
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="interviews-export.pdf"',
  })
  return pdf
})
