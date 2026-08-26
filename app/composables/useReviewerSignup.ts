export interface ReviewerSignupSlot {
  id: string
  jobId: string
  jobTitle: string
  title: string
  type: string
  startsAt: string
  duration: number
  timezone: string
  location: string | null
  capacity: number
  bookedCount: number
  available: number
  status: 'open' | 'closed'
  /** Names typed manually by staff on the slot itself. */
  manualInterviewers: string[]
  /** Reviewers signed up via this feature. */
  reviewers: Array<{ userId: string, name: string, source: 'manual' | 'availability' }>
  signedUp: boolean
  signupSource: 'manual' | 'availability' | null
}

export interface ReviewerAvailabilityRange {
  id: string
  jobId: string
  startsAt: string
  endsAt: string
}

/**
 * Reviewer interviewer-signup: list the upcoming slots of the caller's
 * in-scope jobs, join/leave individual slots, and store availability ranges
 * that auto-assign them to every slot the range covers.
 */
export function useReviewerSignup(jobId?: MaybeRefOrGetter<string | undefined>) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = computed(() => {
    const id = toValue(jobId)
    return id ? { jobId: id } : {}
  })

  const { data, status, error, refresh } = useFetch<{
    jobs: Array<{ id: string, title: string }>
    slots: ReviewerSignupSlot[]
    availability: ReviewerAvailabilityRange[]
  }>('/api/reviewer/interview-slots', {
    key: computed(() => `reviewer-signup-${toValue(jobId) ?? 'all'}`),
    query,
    headers: useRequestHeaders(['cookie']),
    default: () => ({ jobs: [], slots: [], availability: [] }),
  })

  const jobs = computed(() => data.value?.jobs ?? [])
  const slots = computed(() => data.value?.slots ?? [])
  const availability = computed(() => data.value?.availability ?? [])

  async function joinSlot(slotId: string) {
    try {
      await $fetch(`/api/interview-slots/${slotId}/signup`, { method: 'POST' })
      await refresh()
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function leaveSlot(slotId: string) {
    try {
      await $fetch(`/api/interview-slots/${slotId}/signup`, { method: 'DELETE' })
      await refresh()
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function saveAvailability(forJobId: string, ranges: Array<{ startsAt: string, endsAt: string }>) {
    try {
      const res = await $fetch('/api/reviewer/availability', {
        method: 'PUT',
        body: { jobId: forJobId, ranges },
      })
      await refresh()
      return res
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  return { jobs, slots, availability, status, error, refresh, joinSlot, leaveSlot, saveAvailability }
}
