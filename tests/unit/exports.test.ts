import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildApplicationsWorkbook } from '../../server/utils/exports/applicationsWorkbook'
import { buildInterviewsWorkbook, buildInterviewsHtml, type InterviewExportRow } from '../../server/utils/exports/interviewsExport'
import { applicationExportSchema, interviewExportSchema, ratingsExportSchema, MAX_EXPORT_ROWS, MAX_XLSX_EXPORT_ROWS } from '../../server/utils/schemas/export'

/** Minimal stand-in for a loaded application row. */
function app(overrides: Record<string, any> = {}): any {
  return {
    id: 'app_1',
    status: 'screening',
    score: 82,
    createdAt: new Date('2026-05-04T10:00:00Z'),
    candidate: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+1 555 010 0199' },
    job: { title: 'Camera Operator' },
    responses: [],
    interviews: [],
    reviews: [],
    ...overrides,
  }
}

function question(id: string, label: string, displayOrder: number, sectionOrder = 0) {
  return { id, label, type: 'short_text', displayOrder, section: { id: 's1', title: 'S', displayOrder: sectionOrder } }
}

async function readSheet(buffer: Buffer, name: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)
  const sheet = workbook.getWorksheet(name)!
  return {
    headers: (sheet.getRow(1).values as any[]).slice(1).map(v => String(v ?? '')),
    row: (n: number) => (sheet.getRow(n).values as any[]).slice(1).map(v => (v == null ? '' : String(v))),
    rowCount: sheet.rowCount,
  }
}

describe('applications workbook', () => {
  it('writes one row per applicant with the pipeline facts', async () => {
    const sheet = await readSheet(await buildApplicationsWorkbook([app()]), 'Applications')

    expect(sheet.headers.slice(0, 7)).toEqual([
      'Candidate', 'Email', 'Phone', 'Job', 'Stage', 'Applied', 'AI score',
    ])
    expect(sheet.row(2).slice(0, 7)).toEqual([
      'Ada Lovelace', 'ada@example.com', '+1 555 010 0199', 'Camera Operator', 'Screening', '2026-05-04', '82',
    ])
  })

  it('adds a column per custom question, in form order', async () => {
    const rows = [app({
      responses: [
        { value: 'Second', question: question('q2', 'Notice period', 2) },
        { value: 'First', question: question('q1', 'Years of experience', 1) },
      ],
    })]

    const sheet = await readSheet(await buildApplicationsWorkbook(rows), 'Applications')
    expect(sheet.headers.slice(-2)).toEqual(['Years of experience', 'Notice period'])
    expect(sheet.row(2).slice(-2)).toEqual(['First', 'Second'])
  })

  it('leaves a blank cell where an applicant skipped a question', async () => {
    const rows = [
      app({ id: 'a', responses: [{ value: 'Yes', question: question('q1', 'Drives?', 1) }] }),
      app({ id: 'b', candidate: { firstName: 'Grace', lastName: 'Hopper', email: 'g@example.com', phone: null }, responses: [] }),
    ]

    const sheet = await readSheet(await buildApplicationsWorkbook(rows), 'Applications')
    expect(sheet.row(2).at(-1)).toBe('Yes')
    expect(sheet.row(3).at(-1)).toBe('')
  })

  it('renders each answer shape as a single cell', async () => {
    const rows = [app({
      responses: [
        { value: ['Camera', 'Lighting'], question: question('q1', 'Kit', 1) },
        { value: true, question: question('q2', 'Licence', 2) },
        { value: { Camera: 4, Lighting: 2 }, question: question('q3', 'Rate your kit', 3) },
      ],
    })]

    const sheet = await readSheet(await buildApplicationsWorkbook(rows), 'Applications')
    expect(sheet.row(2).slice(-3)).toEqual(['Camera, Lighting', 'Yes', 'Camera: 4; Lighting: 2'])
  })

  it('disambiguates identical question labels from different jobs', async () => {
    const rows = [
      app({ id: 'a', job: { title: 'Camera Operator' }, responses: [{ value: '3', question: question('q1', 'Experience', 1) }] }),
      app({ id: 'b', job: { title: 'Editor' }, responses: [{ value: '5', question: question('q2', 'Experience', 1) }] }),
    ]

    const sheet = await readSheet(await buildApplicationsWorkbook(rows), 'Applications')
    expect(sheet.headers.slice(-2)).toEqual(['Experience (Camera Operator)', 'Experience (Editor)'])
  })

  it('averages the reviewer ratings it was given', async () => {
    const rows = [app({ reviews: [{ rating: 4 }, { rating: 5 }, { rating: null }] })]
    const sheet = await readSheet(await buildApplicationsWorkbook(rows), 'Applications')
    expect(sheet.row(2)[7]).toBe('4.5')
  })
})

describe('interviews export', () => {
  const rows: InterviewExportRow[] = [
    {
      id: 'i2',
      title: 'Second round',
      type: 'in_person',
      status: 'scheduled',
      scheduledAt: new Date('2026-06-02T14:00:00Z'),
      duration: 60,
      location: 'Studio B',
      interviewers: ['sam@example.com'],
      candidateName: 'Grace Hopper',
      candidateEmail: 'grace@example.com',
      jobTitle: 'Editor',
    },
    {
      id: 'i1',
      title: 'Screen',
      type: 'video',
      status: 'completed',
      scheduledAt: new Date('2026-06-01T09:00:00Z'),
      duration: 30,
      location: null,
      interviewers: null,
      candidateName: 'Ada Lovelace',
      candidateEmail: 'ada@example.com',
      jobTitle: 'Camera Operator',
    },
  ]

  it('orders by time regardless of input order', async () => {
    const sheet = await readSheet(await buildInterviewsWorkbook(rows), 'Interviews')
    expect(sheet.row(2)[2]).toBe('Ada Lovelace')
    expect(sheet.row(3)[2]).toBe('Grace Hopper')
  })

  it('labels types and statuses for reading', async () => {
    const sheet = await readSheet(await buildInterviewsWorkbook(rows), 'Interviews')
    expect(sheet.row(2)[6]).toBe('Video Call')
    expect(sheet.row(2)[7]).toBe('Completed')
  })

  it('groups the printable sheet by day', () => {
    const html = buildInterviewsHtml(rows, { orgName: 'Pegasus' })
    const days = html.match(/<h2>/g) ?? []
    expect(days).toHaveLength(2)
    expect(html).toContain('Pegasus')
    expect(html).toContain('2 interviews')
  })

  it('escapes candidate-supplied text in the printable sheet', () => {
    const html = buildInterviewsHtml([{ ...rows[1]!, candidateName: '<script>x</script>' }])
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('export request schemas', () => {
  it('takes either a hand-picked set or the list filters', () => {
    expect(applicationExportSchema.safeParse({ format: 'xlsx', applicationIds: ['a'] }).success).toBe(true)
    expect(applicationExportSchema.safeParse({ format: 'pdf', filters: { status: 'screening' } }).success).toBe(true)
    // Neither is valid too — that's "everything in the org".
    expect(applicationExportSchema.safeParse({ format: 'pdf' }).success).toBe(true)
  })

  it('rejects an unknown format', () => {
    expect(applicationExportSchema.safeParse({ format: 'docx' }).success).toBe(false)
    expect(interviewExportSchema.safeParse({ format: 'docx' }).success).toBe(false)
    // Ratings keeps CSV, which the other two don't offer.
    expect(ratingsExportSchema.safeParse({ format: 'csv' }).success).toBe(true)
  })

  it('caps a single export', () => {
    const ids = Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, i) => `app_${i}`)
    // Applications allow big spreadsheet exports (the endpoint enforces the
    // tighter PDF cap by format); interviews keep the shared cap.
    expect(applicationExportSchema.safeParse({ format: 'xlsx', applicationIds: ids }).success).toBe(true)
    const tooMany = Array.from({ length: MAX_XLSX_EXPORT_ROWS + 1 }, (_, i) => `app_${i}`)
    expect(applicationExportSchema.safeParse({ format: 'xlsx', applicationIds: tooMany }).success).toBe(false)
    expect(interviewExportSchema.safeParse({ format: 'xlsx', interviewIds: ids }).success).toBe(false)
  })
})
