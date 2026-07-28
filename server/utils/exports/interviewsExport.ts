import ExcelJS from 'exceljs'

/**
 * Spreadsheet and printable forms of an interview schedule export.
 *
 * Both group by day, matching how the interviews board reads on screen — the
 * export is meant to be handed round as a day sheet.
 */

export interface InterviewExportRow {
  id: string
  title: string | null
  type: string
  status: string
  scheduledAt: Date
  duration: number
  location: string | null
  interviewers: string[] | null
  candidateName: string
  candidateEmail: string
  jobTitle: string
}

const TYPE_LABELS: Record<string, string> = {
  video: 'Video Call',
  phone: 'Phone Call',
  in_person: 'In Person',
  technical: 'Technical Interview',
  panel: 'Panel Interview',
  take_home: 'Take-Home Assignment',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
}

function dayKey(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Interviews grouped by calendar day, each day's list in time order. */
function groupByDay(rows: InterviewExportRow[]): [string, InterviewExportRow[]][] {
  const sorted = [...rows].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const groups = new Map<string, InterviewExportRow[]>()
  for (const row of sorted) {
    const key = dayKey(row.scheduledAt)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  return [...groups.entries()]
}

export async function buildInterviewsWorkbook(
  rows: InterviewExportRow[],
  opts: { orgName?: string } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = opts.orgName ?? 'Reqcore'
  const sheet = workbook.addWorksheet('Interviews')

  sheet.columns = [
    { header: 'Day', width: 24 },
    { header: 'Time', width: 10 },
    { header: 'Candidate', width: 26 },
    { header: 'Email', width: 30 },
    { header: 'Job', width: 26 },
    { header: 'Interview', width: 24 },
    { header: 'Type', width: 18 },
    { header: 'Status', width: 12 },
    { header: 'Duration (min)', width: 14 },
    { header: 'Location', width: 28 },
    { header: 'Interviewers', width: 32 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const [day, dayRows] of groupByDay(rows)) {
    for (const row of dayRows) {
      sheet.addRow([
        day,
        timeLabel(row.scheduledAt),
        row.candidateName,
        row.candidateEmail,
        row.jobTitle,
        row.title ?? '',
        TYPE_LABELS[row.type] ?? row.type,
        STATUS_LABELS[row.status] ?? row.status,
        row.duration,
        row.location ?? '',
        (row.interviewers ?? []).join(', '),
      ])
    }
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Printable day-by-day schedule, one table per day. */
export function buildInterviewsHtml(
  rows: InterviewExportRow[],
  opts: { orgName?: string } = {},
): string {
  const days = groupByDay(rows).map(([day, dayRows]) => `
    <section class="day">
      <h2>${escapeHtml(day)}</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Candidate</th><th>Job</th><th>Interview</th>
            <th>Type</th><th>Status</th><th>Location</th><th>Interviewers</th>
          </tr>
        </thead>
        <tbody>
          ${dayRows.map(row => `
            <tr>
              <td class="nowrap">${escapeHtml(timeLabel(row.scheduledAt))}<span class="muted"> · ${row.duration}m</span></td>
              <td>${escapeHtml(row.candidateName)}<div class="muted">${escapeHtml(row.candidateEmail)}</div></td>
              <td>${escapeHtml(row.jobTitle)}</td>
              <td>${escapeHtml(row.title ?? '')}</td>
              <td>${escapeHtml(TYPE_LABELS[row.type] ?? row.type)}</td>
              <td>${escapeHtml(STATUS_LABELS[row.status] ?? row.status)}</td>
              <td>${escapeHtml(row.location ?? '')}</td>
              <td>${escapeHtml((row.interviewers ?? []).join(', '))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `).join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Interview schedule</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 0; padding: 28px; font-size: 11px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
      .header { margin-bottom: 20px; }
      .muted { color: #6b7280; font-size: 10px; }
      .nowrap { white-space: nowrap; }
      .day { margin-bottom: 22px; page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; padding: 4px 6px; }
      td { padding: 6px; border-top: 1px solid #f3f4f6; vertical-align: top; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Interview schedule</h1>
      <div class="muted">${escapeHtml(opts.orgName ?? '')}${opts.orgName ? ' · ' : ''}${rows.length} interview${rows.length === 1 ? '' : 's'}</div>
    </div>
    ${days || '<p class="muted">No interviews to show.</p>'}
  </body>
</html>`
}
