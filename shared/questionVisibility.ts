/**
 * Branching rules for application-form questions.
 *
 * A question can carry `config.visibleWhen`, naming another question and the
 * answers that reveal it. The same evaluation runs on the candidate form, in
 * the recruiter's preview and on the server when an application arrives, so it
 * lives here rather than in any one of them.
 */

/** Types with a discrete, listable answer — the only ones a branch can key off. */
export const BRANCHABLE_QUESTION_TYPES = ['single_select', 'multi_select', 'checkbox'] as const

export type VisibilityCondition = {
  /** The question whose answer decides this one's visibility. */
  questionId: string
  /** Show when the controlling answer matches any of these. */
  values: string[]
}

export type VisibilityQuestion = {
  id: string
  label?: string
  type?: string
  config?: { visibleWhen?: VisibilityCondition | null } | null
}

export type AnswerValue =
  | string | string[] | number | boolean | Record<string, number> | null | undefined

/** Whether a controlling answer satisfies a condition's accepted values. */
function answerMatches(answer: AnswerValue, values: string[]): boolean {
  if (answer === undefined || answer === null || answer === '') return false
  if (Array.isArray(answer)) return answer.some(v => values.includes(String(v)))
  // Rating grids answer as an object; they can't drive a branch.
  if (typeof answer === 'object') return false
  return values.includes(String(answer))
}

/**
 * Ids of the questions a candidate should currently see, given their answers
 * so far. A branch on a hidden question is itself hidden, so chains collapse
 * from the top down.
 */
export function visibleQuestionIds(
  questions: VisibilityQuestion[],
  responses: Record<string, AnswerValue>,
): Set<string> {
  const byId = new Map(questions.map(q => [q.id, q]))
  const resolved = new Map<string, boolean>()
  const visiting = new Set<string>()

  function resolve(question: VisibilityQuestion): boolean {
    const cached = resolved.get(question.id)
    if (cached !== undefined) return cached
    // The editor can't build a cycle, but never hide a question forever if one
    // somehow exists.
    if (visiting.has(question.id)) return true

    const condition = question.config?.visibleWhen
    let visible = true
    if (condition) {
      const controller = byId.get(condition.questionId)
      // A condition pointing at a deleted question is ignored, not obeyed.
      if (controller) {
        visiting.add(question.id)
        visible = resolve(controller) && answerMatches(responses[controller.id], condition.values)
        visiting.delete(question.id)
      }
    }

    resolved.set(question.id, visible)
    return visible
  }

  const ids = new Set<string>()
  for (const question of questions) {
    if (resolve(question)) ids.add(question.id)
  }
  return ids
}

/** Human-readable summary of a branch, e.g. `Shown when “Own a car?” is Yes`. */
export function describeVisibilityCondition(
  condition: VisibilityCondition | null | undefined,
  questions: VisibilityQuestion[],
): string | null {
  if (!condition) return null
  const controller = questions.find(q => q.id === condition.questionId)
  if (!controller) return null
  const label = controller.label || 'another question'
  const values = condition.values
    .map(v => (controller.type === 'checkbox' ? (v === 'true' ? 'Yes' : 'No') : v))
    .join(' or ')
  return `Shown when “${label}” is ${values}`
}
