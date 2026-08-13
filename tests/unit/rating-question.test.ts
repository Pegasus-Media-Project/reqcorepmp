import { describe, it, expect } from 'vitest'
import { createQuestionSchema, updateQuestionSchema } from '../../server/utils/schemas/jobQuestion'
import { publicApplicationSchema } from '../../server/utils/schemas/publicApplication'
import { isAnswerMissing, ratingRows, unratedRows } from '../../app/utils/questionAnswers'

/**
 * `rating` questions render a grid: `options` holds the rows to rate and
 * `config` the scale. Answers come back as { row label → score }.
 */
describe('rating questions', () => {
  const base = {
    label: 'Rate your experience with each item',
    type: 'rating' as const,
    required: true,
    displayOrder: 0,
  }

  it('accepts rows plus a scale', () => {
    const parsed = createQuestionSchema.safeParse({
      ...base,
      options: ['Cinema Camera', 'DSLR Camera', 'DaVinci Resolve'],
      config: { ratingMax: 5, ratingMinLabel: 'Not experienced', ratingMaxLabel: 'Experienced' },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.config?.ratingMax).toBe(5)
  })

  it('requires at least one row to rate', () => {
    const parsed = createQuestionSchema.safeParse({ ...base, options: [] })
    expect(parsed.success).toBe(false)
  })

  it('rejects a scale outside the supported range', () => {
    expect(createQuestionSchema.safeParse({
      ...base,
      options: ['Cinema Camera'],
      config: { ratingMax: 1 },
    }).success).toBe(false)

    expect(createQuestionSchema.safeParse({
      ...base,
      options: ['Cinema Camera'],
      config: { ratingMax: 11 },
    }).success).toBe(false)
  })

  it('allows updating just the scale', () => {
    const parsed = updateQuestionSchema.safeParse({ config: { ratingMax: 7 } })
    expect(parsed.success).toBe(true)
  })

  it('accepts a row → score map as a submitted answer', () => {
    const parsed = publicApplicationSchema.safeParse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      responses: [
        { questionId: 'q1', value: { 'Cinema Camera': 4, 'DSLR Camera': 2 } },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects out-of-range scores in a submitted answer', () => {
    const parsed = publicApplicationSchema.safeParse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      responses: [{ questionId: 'q1', value: { 'Cinema Camera': 0 } }],
    })
    expect(parsed.success).toBe(false)
  })
})

/**
 * The candidate form and the submit endpoint have to agree on what an
 * unanswered grid is, or an applicant hits a required error they can't clear.
 */
describe('rating completeness', () => {
  const question = { type: 'rating', options: ['Cinema Camera', 'DSLR Camera'] }

  it('counts a grid as answered only once every row is scored', () => {
    expect(isAnswerMissing(question, { 'Cinema Camera': 4 })).toBe(true)
    expect(isAnswerMissing(question, { 'Cinema Camera': 4, 'DSLR Camera': 2 })).toBe(false)
  })

  it('names the rows still waiting for a score', () => {
    expect(unratedRows(question, { 'Cinema Camera': 4 })).toEqual(['DSLR Camera'])
    expect(unratedRows(question, undefined)).toEqual(['Cinema Camera', 'DSLR Camera'])
  })

  it('never requires a grid that renders no rows to score', () => {
    // No rows means no radio buttons on screen: requiring an answer would lock
    // the applicant out of submitting entirely.
    expect(isAnswerMissing({ type: 'rating', options: [] }, undefined)).toBe(false)
    expect(isAnswerMissing({ type: 'rating', options: null }, undefined)).toBe(false)
  })

  it('ignores rows that could never be rendered or answered', () => {
    const malformed = { type: 'rating', options: ['Cinema Camera', '  ', null, { label: 'x' }] as never }
    expect(ratingRows(malformed)).toEqual(['Cinema Camera'])
    expect(isAnswerMissing(malformed, { 'Cinema Camera': 3 })).toBe(false)
  })
})
