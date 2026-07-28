import { describe, it, expect } from 'vitest'
import {
  visibleQuestionIds,
  describeVisibilityCondition,
  type VisibilityQuestion,
} from '../../shared/questionVisibility'

const licence: VisibilityQuestion = { id: 'licence', label: 'Do you drive?', type: 'checkbox' }
const gear: VisibilityQuestion = { id: 'gear', label: 'Which gear?', type: 'multi_select' }
const level: VisibilityQuestion = { id: 'level', label: 'Experience level', type: 'single_select' }

/** A question revealed when `questionId` answers with one of `values`. */
const branched = (id: string, questionId: string, values: string[]): VisibilityQuestion => ({
  id, label: id, type: 'short_text', config: { visibleWhen: { questionId, values } },
})

describe('question branching', () => {
  it('shows unconditional questions regardless of answers', () => {
    const visible = visibleQuestionIds([licence, gear], {})
    expect([...visible].sort()).toEqual(['gear', 'licence'])
  })

  it('reveals a question only on a matching single-select answer', () => {
    const questions = [level, branched('years', 'level', ['Senior', 'Lead'])]
    expect(visibleQuestionIds(questions, { level: 'Senior' }).has('years')).toBe(true)
    expect(visibleQuestionIds(questions, { level: 'Junior' }).has('years')).toBe(false)
    expect(visibleQuestionIds(questions, {}).has('years')).toBe(false)
  })

  it('matches any selected value of a multi-select', () => {
    const questions = [gear, branched('camera_detail', 'gear', ['Camera'])]
    expect(visibleQuestionIds(questions, { gear: ['Lighting', 'Camera'] }).has('camera_detail')).toBe(true)
    expect(visibleQuestionIds(questions, { gear: ['Lighting'] }).has('camera_detail')).toBe(false)
    expect(visibleQuestionIds(questions, { gear: [] }).has('camera_detail')).toBe(false)
  })

  it('treats a checkbox as its stringified boolean', () => {
    const questions = [licence, branched('licence_number', 'licence', ['true'])]
    expect(visibleQuestionIds(questions, { licence: true }).has('licence_number')).toBe(true)
    expect(visibleQuestionIds(questions, { licence: false }).has('licence_number')).toBe(false)
  })

  it('never reveals a branch off a hidden question', () => {
    const questions = [
      licence,
      branched('own_car', 'licence', ['true']),
      // Chained: only reachable while `own_car` is itself visible.
      { ...branched('car_model', 'own_car', ['Yes']), type: 'short_text' },
    ]
    // Stale answers from before the branch closed must not resurrect the chain.
    const visible = visibleQuestionIds(questions, { licence: false, own_car: 'Yes' })
    expect(visible.has('own_car')).toBe(false)
    expect(visible.has('car_model')).toBe(false)
  })

  it('ignores a condition pointing at a deleted question', () => {
    const questions = [branched('orphan', 'gone', ['Yes'])]
    expect(visibleQuestionIds(questions, {}).has('orphan')).toBe(true)
  })

  it('fails open rather than hiding both halves of a cycle', () => {
    const questions = [branched('a', 'b', ['Yes']), branched('b', 'a', ['Yes'])]
    const visible = visibleQuestionIds(questions, { a: 'Yes', b: 'Yes' })
    expect(visible.size).toBe(2)
  })

  it('ignores rating answers as branch drivers', () => {
    const rating: VisibilityQuestion = { id: 'kit', label: 'Rate your kit', type: 'rating' }
    const questions = [rating, branched('followup', 'kit', ['3'])]
    expect(visibleQuestionIds(questions, { kit: { Camera: 3 } }).has('followup')).toBe(false)
  })

  describe('describeVisibilityCondition', () => {
    it('names the controlling question and its trigger answers', () => {
      expect(describeVisibilityCondition({ questionId: 'level', values: ['Senior', 'Lead'] }, [level]))
        .toBe('Shown when “Experience level” is Senior or Lead')
    })

    it('renders checkbox triggers as Yes/No', () => {
      expect(describeVisibilityCondition({ questionId: 'licence', values: ['true'] }, [licence]))
        .toBe('Shown when “Do you drive?” is Yes')
    })

    it('returns nothing without a resolvable condition', () => {
      expect(describeVisibilityCondition(null, [level])).toBeNull()
      expect(describeVisibilityCondition({ questionId: 'gone', values: ['Yes'] }, [level])).toBeNull()
    })
  })
})
