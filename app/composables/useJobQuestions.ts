import type { MaybeRefOrGetter } from 'vue'

/**
 * Composable for managing custom questions on a job's application form.
 * Wraps the question CRUD endpoints for the recruiter dashboard.
 */
export function useJobQuestions(jobId: MaybeRefOrGetter<string>) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const id = computed(() => toValue(jobId))

  const { data: questions, status, error, refresh } = useFetch(
    () => `/api/jobs/${id.value}/questions`,
    {
      key: computed(() => `job-questions-${id.value}`),
      headers: useRequestHeaders(['cookie']),
      default: () => [] as any[],
    },
  )

  const { data: sections, refresh: refreshSections } = useFetch(
    () => `/api/jobs/${id.value}/sections`,
    {
      key: computed(() => `job-sections-${id.value}`),
      headers: useRequestHeaders(['cookie']),
      default: () => [] as any[],
    },
  )

  /** Add a new custom question */
  async function addQuestion(payload: {
    label: string
    type?: string
    description?: string
    content?: string
    required?: boolean
    options?: string[]
    /** Type-specific settings (rating grids carry their scale here). */
    config?: { ratingMax?: number, ratingMinLabel?: string | null, ratingMaxLabel?: string | null, visibleWhen?: { questionId: string, values: string[] } | null } | null
    displayOrder?: number
    sectionId?: string | null
  }) {
    try {
      const created = await $fetch(`/api/jobs/${id.value}/questions`, {
        method: 'POST',
        body: payload,
      })
      await refresh()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Update an existing question */
  async function updateQuestion(questionId: string, payload: {
    label?: string
    type?: string
    description?: string | null
    content?: string | null
    required?: boolean
    options?: string[] | null
    config?: { ratingMax?: number, ratingMinLabel?: string | null, ratingMaxLabel?: string | null, visibleWhen?: { questionId: string, values: string[] } | null } | null
    displayOrder?: number
    sectionId?: string | null
  }) {
    try {
      const updated = await $fetch(`/api/jobs/${id.value}/questions/${questionId}`, {
        method: 'PATCH',
        body: payload,
      })
      await refresh()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Delete a question by ID */
  async function deleteQuestion(questionId: string) {
    try {
      await $fetch(`/api/jobs/${id.value}/questions/${questionId}`, {
        method: 'DELETE',
      })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refresh()
  }

  /** Bulk reorder questions */
  async function reorderQuestions(order: { id: string; displayOrder: number }[]) {
    try {
      await $fetch(`/api/jobs/${id.value}/questions/reorder`, {
        method: 'PUT',
        body: { order },
      })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refresh()
  }

  // ── Sections (wizard pages) ──

  async function addSection(payload: { title: string; description?: string; displayOrder?: number }) {
    try {
      const created = await $fetch(`/api/jobs/${id.value}/sections`, { method: 'POST', body: payload })
      await refreshSections()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function updateSection(sectionId: string, payload: { title?: string; description?: string | null; displayOrder?: number }) {
    try {
      const updated = await $fetch(`/api/jobs/${id.value}/sections/${sectionId}`, { method: 'PATCH', body: payload })
      await refreshSections()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function deleteSection(sectionId: string) {
    try {
      await $fetch(`/api/jobs/${id.value}/sections/${sectionId}`, { method: 'DELETE' })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    // Questions in the removed section fall back to the default page.
    await Promise.all([refreshSections(), refresh()])
  }

  async function reorderSections(order: { id: string; displayOrder: number }[]) {
    try {
      await $fetch(`/api/jobs/${id.value}/sections/reorder`, { method: 'PUT', body: { order } })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refreshSections()
  }

  return {
    questions,
    sections,
    status,
    error,
    refresh,
    refreshSections,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
  }
}
