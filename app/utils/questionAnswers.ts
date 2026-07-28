/**
 * Shared "is this question answered?" rules for the candidate-facing form.
 * The apply page and the form body both validate required questions, so the
 * definition of an empty answer lives here to keep them in step.
 */

type AnswerShape = string | string[] | number | boolean | Record<string, number> | null | undefined

type AnsweredQuestion = {
  type: string
  options?: string[] | null
}

/** A rating grid is only complete once every one of its rows has a rating. */
function isRatingIncomplete(question: AnsweredQuestion, value: AnswerShape): boolean {
  const rows = question.options ?? []
  if (rows.length === 0) return false
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true
  return rows.some(row => typeof (value as Record<string, number>)[row] !== 'number')
}

/** Whether a required question still needs an answer. */
export function isAnswerMissing(question: AnsweredQuestion, value: AnswerShape): boolean {
  if (question.type === 'rating') return isRatingIncomplete(question, value)
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/** Whether an answer carries anything worth submitting (drops blanks). */
export function hasAnswerValue(value: AnswerShape): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}
