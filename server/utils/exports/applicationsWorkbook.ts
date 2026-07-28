import ExcelJS from 'exceljs'
import type { ApplicationPdfRecord } from '../application-pdf'

/**
 * Build the spreadsheet form of an application export.
 *
 * One row per applicant: the pipeline facts first, then a column for every
 * custom question on the jobs in the set, so the sheet can be filtered and
 * sorted on the answers. Questions are ordered as they appear on the form.
 */

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interview: 'Interview',
  waitlist: 'Waitlist',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

const FIXED_COLUMNS = [
  { header: 'Candidate', width: 26 },
  { header: 'Email', width: 30 },
  { header: 'Phone', width: 18 },
  { header: 'Job', width: 26 },
  { header: 'Stage', width: 13 },
  { header: 'Applied', width: 12 },
  { header: 'AI score', width: 10 },
  { header: 'Avg rating', width: 11 },
  { header: 'Reviews', width: 9 },
  { header: 'Interviews', width: 10 },
] as const

/** Render a stored answer as a single cell value. */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  // Rating grids answer as { row → score }.
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([row, score]) => `${row}: ${score}`)
      .join('; ')
  }
  return String(value)
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function averageRating(app: ApplicationPdfRecord): number | '' {
  const ratings = app.reviews.map(r => r.rating).filter((r): r is number => typeof r === 'number')
  if (!ratings.length) return ''
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
}

/**
 * Every custom question across the exported applications, in form order.
 * Two jobs can define the same label, so columns are keyed by question id and
 * the header disambiguates with the job title when labels collide.
 */
function collectQuestionColumns(apps: ApplicationPdfRecord[]) {
  const byId = new Map<string, { id: string, label: string, sectionOrder: number, order: number, jobTitle: string }>()

  for (const app of apps) {
    for (const response of app.responses) {
      const question = response.question
      if (!question || byId.has(question.id)) continue
      byId.set(question.id, {
        id: question.id,
        label: question.label,
        sectionOrder: question.section?.displayOrder ?? -1,
        order: question.displayOrder,
        jobTitle: app.job?.title ?? '',
      })
    }
  }

  const columns = [...byId.values()].sort((a, b) =>
    a.sectionOrder - b.sectionOrder || a.order - b.order || a.label.localeCompare(b.label))

  const labelCounts = new Map<string, number>()
  for (const column of columns) {
    labelCounts.set(column.label, (labelCounts.get(column.label) ?? 0) + 1)
  }

  return columns.map(column => ({
    ...column,
    // Only reach for the job title when the bare label would be ambiguous.
    header: (labelCounts.get(column.label) ?? 0) > 1 && column.jobTitle
      ? `${column.label} (${column.jobTitle})`
      : column.label,
  }))
}

export async function buildApplicationsWorkbook(
  apps: ApplicationPdfRecord[],
  opts: { orgName?: string } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = opts.orgName ?? 'Reqcore'
  const sheet = workbook.addWorksheet('Applications')

  const questionColumns = collectQuestionColumns(apps)

  sheet.columns = [
    ...FIXED_COLUMNS.map(c => ({ header: c.header, width: c.width })),
    ...questionColumns.map(c => ({ header: c.header, width: 30 })),
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const app of apps) {
    const answers = new Map<string, string>()
    for (const response of app.responses) {
      if (response.question) answers.set(response.question.id, formatAnswer(response.value))
    }

    sheet.addRow([
      `${app.candidate?.firstName ?? ''} ${app.candidate?.lastName ?? ''}`.trim(),
      app.candidate?.email ?? '',
      app.candidate?.phone ?? '',
      app.job?.title ?? '',
      STATUS_LABELS[app.status] ?? app.status,
      formatDate(app.createdAt),
      app.score ?? '',
      averageRating(app),
      app.reviews.length,
      app.interviews.length,
      ...questionColumns.map(column => answers.get(column.id) ?? ''),
    ])
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
