/**
 * Groups an application's question responses by the form page (section) their
 * question belongs to, in the same order the applicant saw on the form:
 * sections ordered by `displayOrder`, then the default/no-page group last, and
 * within each group by question `displayOrder`.
 *
 * Shared by every recruiter-facing response view so they stay consistent.
 * Only groups that actually have responses are returned (unanswered questions
 * and info blocks never produce a response row).
 */
interface ResponseQuestionLike {
  sectionId?: string | null
  displayOrder?: number | null
  section?: { id: string, title: string, displayOrder: number } | null
}

export interface ResponseLike {
  question?: ResponseQuestionLike | null
}

export interface ResponseGroup<T> {
  section: { id: string, title: string } | null
  responses: T[]
}

export function groupResponsesBySection<T extends ResponseLike>(
  responses: T[] | null | undefined,
): ResponseGroup<T>[] {
  const list = responses ?? []
  const bySection = new Map<string | null, T[]>()
  const sectionMeta = new Map<string, { id: string, title: string, displayOrder: number }>()

  for (const r of list) {
    const sec = r.question?.section ?? null
    const key = sec?.id ?? null
    if (sec) sectionMeta.set(sec.id, sec)
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key)!.push(r)
  }

  for (const arr of bySection.values()) {
    arr.sort((a, b) => (a.question?.displayOrder ?? 0) - (b.question?.displayOrder ?? 0))
  }

  const groups: ResponseGroup<T>[] = [...sectionMeta.values()]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(s => ({ section: { id: s.id, title: s.title }, responses: bySection.get(s.id) ?? [] }))
    .filter(g => g.responses.length > 0)

  const defaultResponses = bySection.get(null) ?? []
  if (defaultResponses.length > 0) groups.push({ section: null, responses: defaultResponses })

  return groups
}
