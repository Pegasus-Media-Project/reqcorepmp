/**
 * Build printable HTML for one or more applications, for PDF export.
 *
 * Each application renders a summary block (candidate + pipeline facts) on top,
 * followed by the full detail (question responses grouped by section, cover
 * letter, and attached-document list). In batch mode, every application starts
 * on a fresh page.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { application } from '../database/schema'

/** Hard cap on how many applications a single batch PDF may contain. */
export const MAX_PDF_BATCH = 200

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interview: 'Interview',
  waitlist: 'Waitlist',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

export interface ApplicationPdfFilter {
  orgId: string
  applicationId?: string
  jobId?: string
  /** Restrict to these pipeline statuses (used by the batch export). */
  statuses?: string[]
  limit?: number
}

/** Load the application(s) with all relations needed to render the PDF. */
export async function loadApplicationsForPdf(filter: ApplicationPdfFilter) {
  const conds = [eq(application.organizationId, filter.orgId)]
  if (filter.applicationId) conds.push(eq(application.id, filter.applicationId))
  if (filter.jobId) conds.push(eq(application.jobId, filter.jobId))
  if (filter.statuses?.length) conds.push(inArray(application.status, filter.statuses as any))

  // `with` is inlined (not extracted to a const) so Drizzle infers the relation
  // types on the returned rows.
  return db.query.application.findMany({
    where: and(...conds),
    with: {
      candidate: {
        columns: { id: true, firstName: true, lastName: true, email: true, phone: true },
        with: {
          documents: {
            columns: { id: true, type: true, originalFilename: true, mimeType: true, createdAt: true },
            orderBy: (document, { desc }) => [desc(document.createdAt)],
          },
        },
      },
      job: {
        columns: { id: true, title: true, status: true, slug: true },
      },
      responses: {
        with: {
          question: {
            columns: { id: true, label: true, type: true, options: true, sectionId: true, displayOrder: true },
            with: {
              section: { columns: { id: true, title: true, displayOrder: true } },
            },
          },
        },
        orderBy: (r, { asc }) => [asc(r.createdAt)],
      },
    },
    orderBy: (a, { desc }) => [desc(a.createdAt)],
    limit: filter.limit ?? MAX_PDF_BATCH,
  })
}

export type ApplicationPdfRecord = Awaited<ReturnType<typeof loadApplicationsForPdf>>[number]

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAnswer(value: string | string[] | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Render a single application's block (summary on top, then detail). */
function renderApplication(app: ApplicationPdfRecord, isFirst: boolean): string {
  const c = app.candidate
  const fullName = `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'Unnamed candidate'
  const statusLabel = STATUS_LABELS[app.status] ?? app.status

  const summaryRows: Array<[string, string]> = [
    ['Candidate', fullName],
    ['Email', c?.email ?? '—'],
    ['Phone', c?.phone ?? '—'],
    ['Job', app.job?.title ?? '—'],
    ['Status', statusLabel],
    ['Score', app.score != null ? `${app.score} / 100` : '—'],
    ['Applied', formatDate(app.createdAt)],
    ['Confirmation code', app.confirmationCode ?? '—'],
  ]

  // Group responses by section (preserving section + question display order).
  const grouped = new Map<string, { title: string, order: number, items: Array<{ label: string, order: number, value: string }> }>()
  for (const r of app.responses ?? []) {
    const q = r.question
    if (!q) continue
    const sectionId = q.section?.id ?? '__none__'
    const sectionTitle = q.section?.title ?? 'Responses'
    const sectionOrder = q.section?.displayOrder ?? 9999
    if (!grouped.has(sectionId)) grouped.set(sectionId, { title: sectionTitle, order: sectionOrder, items: [] })
    grouped.get(sectionId)!.items.push({
      label: q.label,
      order: q.displayOrder ?? 9999,
      value: formatAnswer(r.value as any),
    })
  }
  const sections = [...grouped.values()].sort((a, b) => a.order - b.order)
  for (const s of sections) s.items.sort((a, b) => a.order - b.order)

  const summaryHtml = `
    <table class="summary">
      ${summaryRows.map(([k, v]) => `
        <tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>
      `).join('')}
    </table>`

  const responsesHtml = sections.length
    ? sections.map(s => `
        <div class="section">
          <h3>${escapeHtml(s.title)}</h3>
          ${s.items.map(i => `
            <div class="qa">
              <div class="q">${escapeHtml(i.label)}</div>
              <div class="a">${escapeHtml(i.value)}</div>
            </div>
          `).join('')}
        </div>`).join('')
    : '<p class="muted">No question responses.</p>'

  const coverLetterHtml = app.coverLetterText
    ? `<div class="section"><h3>Cover letter</h3><div class="cover">${escapeHtml(app.coverLetterText)}</div></div>`
    : ''

  const docs = c?.documents ?? []
  const docsHtml = docs.length
    ? `<div class="section"><h3>Attached documents</h3><ul class="docs">${docs.map(d =>
        `<li>${escapeHtml(d.originalFilename ?? d.type)} <span class="muted">(${escapeHtml(d.type)})</span></li>`).join('')}</ul></div>`
    : ''

  return `
    <section class="application${isFirst ? ' first' : ''}">
      <div class="summary-page">
        <h1>${escapeHtml(fullName)}</h1>
        <div class="subtitle">${escapeHtml(app.job?.title ?? '')} · ${escapeHtml(statusLabel)}</div>
        ${summaryHtml}
      </div>
      <div class="detail">
        ${responsesHtml}
        ${coverLetterHtml}
        ${docsHtml}
      </div>
    </section>`
}

export interface BuildPdfHtmlOptions {
  orgName?: string
}

/** Build a complete, self-contained HTML document for the given applications. */
export function buildApplicationsPdfHtml(apps: ApplicationPdfRecord[], opts: BuildPdfHtmlOptions = {}): string {
  const orgName = opts.orgName?.trim() || 'Pegasus Media Project'
  const body = apps.map((a, i) => renderApplication(a, i === 0)).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(orgName)} — Applications</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b; font-size: 12px; margin: 0; }
  .application { page-break-before: always; }
  .application.first { page-break-before: avoid; }
  .summary-page { border-bottom: 2px solid #e4e4e7; padding-bottom: 16px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: #71717a; font-size: 13px; margin-bottom: 16px; }
  table.summary { width: 100%; border-collapse: collapse; }
  table.summary th { text-align: left; width: 160px; color: #71717a; font-weight: 600; padding: 5px 8px 5px 0; vertical-align: top; }
  table.summary td { padding: 5px 0; vertical-align: top; }
  .section { margin-bottom: 18px; page-break-inside: avoid; }
  .section h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #52525b; border-bottom: 1px solid #f4f4f5; padding-bottom: 4px; margin: 0 0 10px; }
  .qa { margin-bottom: 10px; }
  .qa .q { font-weight: 600; color: #3f3f46; margin-bottom: 2px; }
  .qa .a { color: #18181b; white-space: pre-wrap; }
  .cover { white-space: pre-wrap; }
  ul.docs { margin: 0; padding-left: 18px; }
  .muted { color: #a1a1aa; }
</style>
</head>
<body>
${body}
</body>
</html>`
}
