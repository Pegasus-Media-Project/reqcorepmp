import { z } from 'zod'
import ExcelJS from 'exceljs'
import { idParamSchema } from '../../../../utils/schemas/job'
import { buildJobReviewAggregate, type ApplicantAggregate } from '../../../../utils/reviewAggregate'

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
})

const COLUMNS = [
  { header: 'Applicant', key: 'candidateName', width: 28 },
  { header: 'Email', key: 'candidateEmail', width: 30 },
  { header: 'Stage', key: 'status', width: 14 },
  { header: 'Avg Screening', key: 'screeningAvg', width: 14 },
  { header: 'Screening Reviews', key: 'screeningCount', width: 16 },
  { header: 'Avg Interview', key: 'interviewAvg', width: 14 },
  { header: 'Interview Reviews', key: 'interviewCount', width: 16 },
  { header: 'Overall Avg', key: 'overallAvg', width: 12 },
  { header: 'Total Reviews', key: 'reviewCount', width: 13 },
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'job'
}

/**
 * GET /api/jobs/:id/reviews/export?format=csv|xlsx
 * Download all applicants and their per-stage review ratings for a job.
 * Requires review:read and that the job is in scope.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { review: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const { format } = await getValidatedQuery(event, exportQuerySchema.parse)

  await assertJobInScope(session, id)

  const { jobTitle, applicants } = await buildJobReviewAggregate(orgId, id)
  const filenameBase = `${slugify(jobTitle)}-ratings`

  if (format === 'csv') {
    const header = COLUMNS.map(c => csvCell(c.header)).join(',')
    const lines = applicants.map(a => rowValues(a).map(csvCell).join(','))
    const csv = [header, ...lines].join('\r\n')

    setResponseHeaders(event, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
    })
    // Prepend a BOM so Excel opens UTF-8 correctly.
    return `﻿${csv}`
  }

  // xlsx
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Ratings')
  sheet.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))
  sheet.getRow(1).font = { bold: true }
  for (const a of applicants) {
    sheet.addRow(rowValues(a))
  }

  const buffer = await workbook.xlsx.writeBuffer()
  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
  })
  return Buffer.from(buffer)
})
