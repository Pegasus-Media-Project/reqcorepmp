import { describe, it, expect } from 'vitest'
import { SURVEY_QUESTIONS, SURVEY_PERSON_PROPS } from '../../app/composables/useOnboardingSurvey'

/**
 * The onboarding survey writes each answer to the user's PostHog person profile
 * under a fixed key. Those keys (question ids + option values) become the column
 * names analytics segments on, so they must stay stable and collision-free — a
 * duplicate id would silently overwrite another question's answer.
 */
describe('onboarding survey config', () => {
  it('asks the five expected questions', () => {
    expect(SURVEY_QUESTIONS.map(q => q.id)).toEqual([
      'company_size',
      'user_role',
      'discovery_source',
      'choice_reason',
      'hiring_frequency',
    ])
  })

  it('has unique, non-empty question ids', () => {
    const ids = SURVEY_QUESTIONS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z_]+$/)
  })

  it('gives every question at least two options with unique values', () => {
    for (const q of SURVEY_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      const values = q.options.map(o => o.value)
      expect(new Set(values).size).toBe(values.length)
      for (const o of q.options) {
        expect(o.value.trim()).not.toBe('')
        expect(o.label.trim()).not.toBe('')
      }
    }
  })

  it('keeps answer keys distinct from the meta person-property keys', () => {
    const metaKeys = Object.values(SURVEY_PERSON_PROPS)
    for (const q of SURVEY_QUESTIONS) {
      expect(metaKeys).not.toContain(q.id)
    }
  })
})
