import type { MaybeRefOrGetter } from 'vue'

export type ReviewStage = 'screening' | 'interview'

export interface ReviewRow {
  id: string
  applicationId: string
  jobId: string
  stage: ReviewStage
  rating: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  reviewerId: string
  reviewerName: string | null
  reviewerEmail: string
  reviewerImage: string | null
}

/**
 * Reviews (human reviewer ratings + notes) for a single application.
 * Open visibility — everyone assigned to the job sees all reviewers' entries.
 * `myReview(stage)` returns the current user's own row so the UI can bind an
 * editable star + notes per stage; `saveReview` upserts it.
 */
export function useReviews(applicationId: MaybeRefOrGetter<string>) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const appId = computed(() => toValue(applicationId))

  const session = authClient.useSession()
  const currentUserId = computed(() => session.value?.data?.user?.id ?? null)

  const { data, status, error, refresh } = useFetch(
    () => `/api/reviews?applicationId=${appId.value}`,
    {
      key: computed(() => `reviews-${appId.value}`),
      headers: useRequestHeaders(['cookie']),
    },
  )

  const reviews = computed<ReviewRow[]>(() => data.value?.data ?? [])

  function myReview(stage: ReviewStage): ReviewRow | undefined {
    return reviews.value.find(r => r.reviewerId === currentUserId.value && r.stage === stage)
  }

  /** Upsert the current user's rating/notes for a stage. */
  async function saveReview(payload: { stage: ReviewStage, rating?: number | null, notes?: string | null }) {
    try {
      const saved = await $fetch('/api/reviews', {
        method: 'POST',
        body: { applicationId: appId.value, ...payload },
      })
      await refresh()
      return saved
    }
    catch (err) {
      handlePreviewReadOnlyError(err)
      throw err
    }
  }

  async function deleteReview(id: string) {
    try {
      await $fetch(`/api/reviews/${id}`, { method: 'DELETE' })
      await refresh()
    }
    catch (err) {
      handlePreviewReadOnlyError(err)
      throw err
    }
  }

  return { reviews, status, error, refresh, myReview, saveReview, deleteReview, currentUserId }
}
