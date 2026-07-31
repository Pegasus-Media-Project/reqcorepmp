import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildQuestionnaireDocx, type QuestionnaireInput, type QuestionnaireQuestion } from '../../server/utils/exports/questionnaireDocument'

/** Pull the readable text out of a generated .docx. */
async function documentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml')!.async('string')
}

async function documentText(buffer: Buffer): Promise<string> {
  const xml = await documentXml(buffer)
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

function question(overrides: Partial<QuestionnaireQuestion> & { id: string, type: string, label: string }): QuestionnaireQuestion {
  return {
    description: null, content: null, required: false, options: null,
    config: null, sectionId: null, displayOrder: 0, ...overrides,
  }
}

function input(overrides: Partial<QuestionnaireInput> = {}): QuestionnaireInput {
  return {
    jobTitle: 'Camera Operator',
    organizationName: 'Pegasus Media Project',
    phoneRequirement: 'required',
    requireResume: false,
    requireCoverLetter: false,
    sections: [],
    questions: [],
    ...overrides,
  }
}

describe('questionnaire document', () => {
  it('is a valid Word package', async () => {
    const buffer = await buildQuestionnaireDocx(input())
    // A .docx is a zip: "PK" magic, with the parts Word expects.
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('word/document.xml')).toBeTruthy()
    expect(zip.file('[Content_Types].xml')).toBeTruthy()
  })

  it('opens with the job, the org and the required-field note', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input()))
    expect(text).toContain('Camera Operator')
    expect(text).toContain('Pegasus Media Project')
    expect(text).toContain('Fields marked * are required')
  })

  it('asks for the built-in details, and skips a hidden phone', async () => {
    const withPhone = await documentText(await buildQuestionnaireDocx(input()))
    expect(withPhone).toContain('First name')
    expect(withPhone).toContain('Phone')

    const hidden = await documentText(await buildQuestionnaireDocx(input({ phoneRequirement: 'hidden' })))
    expect(hidden).not.toContain('Phone')
  })

  it('lays questions out under their section, in form order', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input({
      sections: [
        { id: 's2', title: 'Equipment', description: null, displayOrder: 1 },
        { id: 's1', title: 'Experience', description: null, displayOrder: 0 },
      ],
      questions: [
        question({ id: 'q2', type: 'short_text', label: 'Second question', sectionId: 's1', displayOrder: 1 }),
        question({ id: 'q1', type: 'short_text', label: 'First question', sectionId: 's1', displayOrder: 0 }),
        question({ id: 'q3', type: 'short_text', label: 'Kit question', sectionId: 's2', displayOrder: 2 }),
      ],
    })))

    expect(text.indexOf('Experience')).toBeLessThan(text.indexOf('Equipment'))
    expect(text.indexOf('First question')).toBeLessThan(text.indexOf('Second question'))
    expect(text.indexOf('Second question')).toBeLessThan(text.indexOf('Kit question'))
  })

  it('gives each answer type somewhere to answer', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input({
      questions: [
        question({ id: 'q1', type: 'single_select', label: 'Do you drive?', options: ['Yes', 'No'] }),
        question({ id: 'q2', type: 'multi_select', label: 'Which kit?', options: ['Tripod', 'Gimbal'] }),
        question({ id: 'q3', type: 'checkbox', label: 'Weekends?' }),
        question({ id: 'q4', type: 'url', label: 'Showreel' }),
      ],
    })))

    expect(text).toContain('☐ Yes')
    expect(text).toContain('☐ Tripod')
    expect(text).toContain('Tick all that apply')
    expect(text).toContain('Web address')
    // Ruled lines to write on.
    expect(text).toContain('____')
  })

  it('draws a rating grid with a row per item and a column per point', async () => {
    const xml = await documentXml(await buildQuestionnaireDocx(input({
      questions: [question({
        id: 'q1',
        type: 'rating',
        label: 'Rate your kit',
        options: ['Cinema Camera', 'DSLR Camera'],
        config: { ratingMax: 4, ratingMinLabel: 'Not experienced', ratingMaxLabel: 'Experienced' },
      })],
    })))

    // Header row plus one row per item.
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(3)
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('1 – Not experienced')
    expect(text).toContain('4 – Experienced')
    expect(text).toContain('Cinema Camera')
    // Widths in twips: percentage tables render inconsistently across readers.
    expect(xml).toContain('w:tblW w:type="dxa"')
  })

  it('notes when a branched question applies', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input({
      questions: [
        question({ id: 'q1', type: 'single_select', label: 'Do you drive?', options: ['Yes', 'No'] }),
        question({
          id: 'q2', type: 'short_text', label: 'Licence number', displayOrder: 1,
          config: { visibleWhen: { questionId: 'q1', values: ['Yes'] } },
        }),
      ],
    })))

    expect(text).toContain('Answer only if')
    expect(text).toContain('Do you drive?')
  })

  it('renders an info block as prose, not markup', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input({
      questions: [question({
        id: 'q1', type: 'info', label: 'Before you start',
        content: '<p>Please answer <b>all</b> questions.</p><ul><li>Use black ink</li></ul>',
      })],
    })))

    expect(text).toContain('Please answer all questions.')
    expect(text).toContain('• Use black ink')
    expect(text).not.toContain('<b>')
    expect(text).not.toContain('&lt;p&gt;')
  })

  it('adds the document asks only when the job makes them', async () => {
    const without = await documentText(await buildQuestionnaireDocx(input()))
    expect(without).not.toContain('Resume / CV')

    const with_ = await documentText(await buildQuestionnaireDocx(
      input({ requireResume: true, requireCoverLetter: true })))
    expect(with_).toContain('Resume / CV')
    expect(with_).toContain('Cover letter')
  })

  it('still includes questions whose section was deleted', async () => {
    const text = await documentText(await buildQuestionnaireDocx(input({
      sections: [{ id: 's1', title: 'Experience', description: null, displayOrder: 0 }],
      questions: [question({ id: 'q1', type: 'short_text', label: 'Orphaned question', sectionId: 'gone' })],
    })))

    expect(text).toContain('Additional questions')
    expect(text).toContain('Orphaned question')
  })
})
