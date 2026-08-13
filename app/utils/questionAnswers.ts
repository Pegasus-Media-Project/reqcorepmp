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

/**
 * The rows of a rating grid, as the labels actually rendered and used as answer
 * keys. Anything that isn't a usable label is dropped rather than stringified —
 * a row that reads `[object Object]` can neither be shown nor answered.
 */
export function ratingRows(question: AnsweredQuestion): string[] {
  return (question.options ?? []).filter((row): row is string => typeof row === 'string' && row.trim() !== '')
}

/** Rows of a rating grid still waiting for a score. */
export function unratedRows(question: AnsweredQuestion, value: AnswerShape): string[] {
  const rows = ratingRows(question)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rows
  return rows.filter(row => typeof (value as Record<string, number>)[row] !== 'number')
}

/** Whether a required question still needs an answer. */
export function isAnswerMissing(question: AnsweredQuestion, value: AnswerShape): boolean {
  // A rating grid is only complete once every one of its rows has a score. A
  // grid with no usable rows renders no input at all, so it can never be
  // "missing" — the server agrees, or the applicant would be stuck.
  if (question.type === 'rating') return unratedRows(question, value).length > 0
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
