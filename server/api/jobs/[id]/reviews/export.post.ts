import ExcelJS from 'exceljs'
import { idParamSchema } from '../../../../utils/schemas/job'
import { ratingsExportSchema } from '../../../../utils/schemas/export'
import { buildJobReviewAggregate, type ApplicantAggregate } from '../../../../utils/reviewAggregate'
import { renderHtmlToPdf } from '../../../../utils/pdf'

const COLUMNS = [
  { header: 'Applicant', width: 28 },
  { header: 'Email', width: 30 },
  { header: 'Stage', width: 14 },
  { header: 'Avg Screening', width: 14 },
  { header: 'Screening Reviews', width: 16 },
  { header: 'Avg Interview', width: 14 },
  { header: 'Interview Reviews', width: 16 },
  { header: 'Overall Avg', width: 12 },
  { header: 'Total Reviews', width: 13 },
] as const

function rowValues(a: ApplicantAggregate): (string | number)[] {
  return [
    a.candidateName,
    a.candidateEmail,
    a.status,
    a.screeningAvg ?? '',
    a.screeningCount,
    a.interviewAvg ?? '',
    a.interviewCount,
    a.overallAvg ?? '',
    a.reviewCount,
  ]
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildRatingsHtml(jobTitle: string, applicants: ApplicantAggregate[]): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Ratings — ${escapeHtml(jobTitle)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 0; padding: 28px; font-size: 11px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .muted { color: #6b7280; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
      td { padding: 6px; border-top: 1px solid #f3f4f6; }
      td.num, th.num { text-align: right; }
    </style>
  </head>
  <body>
    <h1>Ratings</h1>
    <div class="muted">${escapeHtml(jobTitle)} · ${applicants.length} applicant${applicants.length === 1 ? '' : 's'}</div>
    <table>
      <thead>
        <tr>${COLUMNS.map((c, i) => `<th class="${i > 2 ? 'num' : ''}">${escapeHtml(c.header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${applicants.map(a => `<tr>${rowValues(a)
          .map((v, i) => `<td class="${i > 2 ? 'num' : ''}">${escapeHtml(v)}</td>`)
          .join('')}</tr>`).join('')}
      </tbody>
    </table>
  </body>
</html>`
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'job'
}

/**
 * POST /api/jobs/:id/reviews/export  { format, applicationIds? }
 *
 * Applicants and their per-stage review ratings, as a spreadsheet, CSV or
 * printable table. Without `applicationIds` it covers every applicant on the
 * job; with them, just the rows the user ticked.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, ratingsExportSchema.parse)

  await assertJobInScope(session, id)

  const { jobTitle, applicants: allApplicants } = await buildJobReviewAggregate(orgId, id)
  const selected = body.applicationIds?.length ? new Set(body.applicationIds) : null
  const applicants = selected
    ? allApplicants.filter(a => selected.has(a.applicationId))
    : allApplicants

  if (!applicants.length) {
    throw createError({ statusCode: 404, statusMessage: 'No applicants to export' })
  }

  const filenameBase = `${slugify(jobTitle)}-ratings`

  if (body.format === 'csv') {
    const header = COLUMNS.map(c => csvCell(c.header)).join(',')
    const lines = applicants.map(a => rowValues(a).map(csvCell).join(','))
    setResponseHeaders(event, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
    })
    // Prepend a BOM so Excel opens UTF-8 correctly.
    return `﻿${[header, ...lines].join('\r\n')}`
  }

  if (body.format === 'pdf') {
    const pdf = await renderHtmlToPdf(buildRatingsHtml(jobTitle, applicants))
    setResponseHeaders(event, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
    })
    return pdf
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Ratings')
  sheet.columns = COLUMNS.map(c => ({ header: c.header, width: c.width }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  for (const a of applicants) sheet.addRow(rowValues(a))
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }

  const buffer = await workbook.xlsx.writeBuffer()
  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
  })
  return Buffer.from(buffer)
})
