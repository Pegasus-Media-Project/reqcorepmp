import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'

/**
 * The blank application form as an editable Word document.
 *
 * This is the questionnaire a recruiter circulates or prints — the questions a
 * candidate will be asked, with room to answer, not anyone's answers. It's
 * generated from the same form definition the live application renders, so the
 * handout can't drift from the form.
 */

export interface QuestionnaireQuestion {
  id: string
  type: string
  label: string
  description?: string | null
  content?: string | null
  required: boolean
  options?: string[] | null
  config?: {
    ratingMax?: number
    ratingMinLabel?: string | null
    ratingMaxLabel?: string | null
    visibleWhen?: { questionId: string, values: string[] } | null
  } | null
  sectionId?: string | null
  displayOrder: number
}

export interface QuestionnaireSection {
  id: string
  title: string
  description?: string | null
  displayOrder: number
}

export interface QuestionnaireInput {
  jobTitle: string
  organizationName?: string | null
  phoneRequirement: 'hidden' | 'optional' | 'required'
  requireResume: boolean
  requireCoverLetter: boolean
  sections: QuestionnaireSection[]
  questions: QuestionnaireQuestion[]
}

const DEFAULT_RATING_MAX = 5

/** Printable width at the margins below — narrow enough for both A4 and Letter. */
const CONTENT_WIDTH_TWIPS = 9600

/** An empty checkbox and a filled-in blank, as plain characters Word can print. */
const CHECKBOX = '☐'
const BLANK_LINE = '_'.repeat(58)

const TYPE_HINTS: Record<string, string> = {
  url: 'Web address',
  date: 'Date (DD/MM/YYYY)',
  number: 'Number',
  file_upload: 'Attach a file with your application',
}

/** Rich info blocks carry HTML; the handout wants their words, not their markup. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A heading that looks like one even in a reader that ignores document styles.
 * The heading level is kept for Word's navigation pane; the run formatting is
 * what actually guarantees the size on screen and in print.
 */
function heading(text: string, level: 'title' | 'section'): Paragraph {
  const isTitle = level === 'title'
  return new Paragraph({
    heading: isTitle ? HeadingLevel.TITLE : HeadingLevel.HEADING_2,
    spacing: isTitle ? { after: 60 } : { before: 320, after: 100 },
    children: [new TextRun({
      text,
      bold: true,
      size: isTitle ? 36 : 26,
      color: '111827',
    })],
  })
}

function label(text: string, required: boolean): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 60 },
    children: [
      new TextRun({ text, bold: true }),
      ...(required ? [new TextRun({ text: ' *', bold: true, color: 'C0392B' })] : []),
    ],
  })
}

function helpText(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, italics: true, size: 18, color: '6B7280' })],
  })
}

/** A ruled line to write on. `lines` stacks several for longer answers. */
function answerLines(lines = 1): Paragraph[] {
  return Array.from({ length: lines }, () => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: BLANK_LINE, color: '9CA3AF' })],
  }))
}

function optionList(options: string[]): Paragraph[] {
  return options.map(option => new Paragraph({
    spacing: { after: 40 },
    indent: { left: 240 },
    children: [new TextRun({ text: `${CHECKBOX}  ${option}` })],
  }))
}

/** The rating grid: one row per item, one column per point on the scale. */
function ratingTable(question: QuestionnaireQuestion): Table {
  const max = question.config?.ratingMax ?? DEFAULT_RATING_MAX
  const columns = Array.from({ length: max }, (_, i) => i + 1)

  const headerLabel = (value: number) => {
    if (value === 1 && question.config?.ratingMinLabel) return `1 – ${question.config.ratingMinLabel}`
    if (value === max && question.config?.ratingMaxLabel) return `${value} – ${question.config.ratingMaxLabel}`
    return String(value)
  }

  const cell = (children: Paragraph[], width: number) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children,
  })

  // Widths in twips rather than percentages: readers disagree on percentage
  // tables, and CONTENT_WIDTH_TWIPS fits both Letter and A4 at these margins.
  const labelWidth = Math.round(CONTENT_WIDTH_TWIPS * 0.4)
  const columnWidth = Math.round((CONTENT_WIDTH_TWIPS - labelWidth) / columns.length)

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell([new Paragraph({ children: [new TextRun({ text: '', bold: true })] })], labelWidth),
      ...columns.map(value => cell([
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: headerLabel(value), bold: true, size: 16 })],
        }),
      ], columnWidth)),
    ],
  })

  const rows = (question.options ?? []).map(item => new TableRow({
    children: [
      cell([new Paragraph({ children: [new TextRun({ text: item, size: 20 })] })], labelWidth),
      ...columns.map(() => cell([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: CHECKBOX })] }),
      ], columnWidth)),
    ],
  }))

  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    },
    rows: [headerRow, ...rows],
  })
}

/** Note on a branched question, so a reader knows when it applies. */
function branchNote(question: QuestionnaireQuestion, byId: Map<string, QuestionnaireQuestion>): Paragraph | null {
  const condition = question.config?.visibleWhen
  if (!condition) return null
  const controller = byId.get(condition.questionId)
  if (!controller) return null
  const values = condition.values
    .map(v => (controller.type === 'checkbox' ? (v === 'true' ? 'Yes' : 'No') : v))
    .join(' or ')
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({
      text: `Answer only if “${controller.label}” is ${values}.`,
      italics: true,
      size: 18,
      color: '92400E',
    })],
  })
}

function renderQuestion(
  question: QuestionnaireQuestion,
  byId: Map<string, QuestionnaireQuestion>,
): (Paragraph | Table)[] {
  // Info blocks are prose for the reader, not something to answer.
  if (question.type === 'info') {
    const body = htmlToText(question.content ?? '')
    return [
      ...(question.label ? [new Paragraph({
        spacing: { before: 220, after: 60 },
        children: [new TextRun({ text: question.label, bold: true })],
      })] : []),
      ...body.split('\n').filter(Boolean).map(line => new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line })],
      })),
    ]
  }

  const parts: (Paragraph | Table)[] = [label(question.label, question.required)]

  const note = branchNote(question, byId)
  if (note) parts.push(note)
  if (question.description) parts.push(helpText(question.description))

  const hint = TYPE_HINTS[question.type]
  if (hint) parts.push(helpText(hint))

  switch (question.type) {
    case 'long_text':
      parts.push(...answerLines(4))
      break
    case 'single_select':
    case 'multi_select':
      parts.push(...optionList(question.options ?? []))
      if (question.type === 'multi_select') parts.push(helpText('Tick all that apply.'))
      break
    case 'checkbox':
      parts.push(...optionList(['Yes', 'No']))
      break
    case 'rating':
      parts.push(ratingTable(question))
      parts.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
      break
    case 'file_upload':
      parts.push(...answerLines(1))
      break
    default:
      parts.push(...answerLines(1))
  }

  return parts
}

/** The fixed fields every application collects, ahead of the custom questions. */
function personalDetails(input: QuestionnaireInput): (Paragraph | Table)[] {
  const parts: (Paragraph | Table)[] = [
    heading('Your details', 'section'),
    label('First name', true), ...answerLines(1),
    label('Last name', true), ...answerLines(1),
    label('Email', true), ...answerLines(1),
  ]

  if (input.phoneRequirement !== 'hidden') {
    parts.push(label('Phone', input.phoneRequirement === 'required'), ...answerLines(1))
  }

  return parts
}

/** The document-upload asks, which sit at the end of the live form. */
function documentsSection(input: QuestionnaireInput): (Paragraph | Table)[] {
  if (!input.requireResume && !input.requireCoverLetter) return []

  const parts: (Paragraph | Table)[] = [
    heading('Documents', 'section'),
  ]

  if (input.requireResume) {
    parts.push(label('Resume / CV', true), helpText('PDF, DOC or DOCX, up to 10 MB.'))
  }
  if (input.requireCoverLetter) {
    parts.push(label('Cover letter', true), ...answerLines(6))
  }

  return parts
}

export async function buildQuestionnaireDocx(input: QuestionnaireInput): Promise<Buffer> {
  const byId = new Map(input.questions.map(q => [q.id, q]))
  const sections = [...input.sections].sort((a, b) => a.displayOrder - b.displayOrder)
  const sectionIds = new Set(sections.map(s => s.id))
  const ordered = (list: QuestionnaireQuestion[]) => [...list].sort((a, b) => a.displayOrder - b.displayOrder)

  const children: (Paragraph | Table)[] = [
    heading(input.jobTitle, 'title'),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({
        text: input.organizationName ? `${input.organizationName} · Application form` : 'Application form',
        color: '6B7280',
      })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({
        text: 'Fields marked * are required.',
        italics: true,
        size: 18,
        color: '6B7280',
      })],
    }),
    ...personalDetails(input),
  ]

  for (const section of sections) {
    const questions = ordered(input.questions.filter(q => q.sectionId === section.id))
    if (!questions.length) continue

    children.push(heading(section.title, 'section'))
    if (section.description) children.push(helpText(section.description))
    for (const question of questions) children.push(...renderQuestion(question, byId))
  }

  // Questions with no (surviving) section — the form's implicit default page.
  const unsectioned = ordered(input.questions.filter(q => !q.sectionId || !sectionIds.has(q.sectionId)))
  if (unsectioned.length) {
    children.push(heading(sections.length ? 'Additional questions' : 'Questions', 'section'))
    for (const question of unsectioned) children.push(...renderQuestion(question, byId))
  }

  children.push(...documentsSection(input))

  const document = new Document({
    creator: input.organizationName ?? 'Reqcore',
    title: `${input.jobTitle} — application form`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
        title: { run: { size: 36, bold: true, color: '111827' } },
        heading2: { run: { size: 26, bold: true, color: '111827' }, paragraph: { spacing: { before: 320, after: 100 } } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  })

  return Packer.toBuffer(document)
}
