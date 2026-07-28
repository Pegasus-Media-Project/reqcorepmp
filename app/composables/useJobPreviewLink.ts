/**
 * Shareable review link for a job's application form.
 *
 * One active link per job: creating always rotates (the server revokes the
 * previous one), so `link` is either the single live link or null.
 */
export type JobPreviewLink = {
  id: string
  token: string
  expiresAt: string
  viewCount: number
  lastViewedAt: string | null
  createdAt: string
}

export function useJobPreviewLink(jobId: string | Ref<string>) {
  const id = toRef(jobId)

  const { data: link, refresh, status } = useFetch<JobPreviewLink | null>(
    () => `/api/jobs/${id.value}/preview-link`,
    {
      key: computed(() => `job-preview-link-${id.value}`),
      headers: useRequestHeaders(['cookie']),
      default: () => null,
    },
  )

  /** Create the link, or rotate the existing one onto a fresh token. */
  async function createLink(expiresInDays?: number) {
    const created = await $fetch<JobPreviewLink>(`/api/jobs/${id.value}/preview-link`, {
      method: 'POST',
      body: expiresInDays ? { expiresInDays } : {},
    })
    await refresh()
    return created
  }

  async function revokeLink() {
    await $fetch(`/api/jobs/${id.value}/preview-link`, { method: 'DELETE' })
    await refresh()
  }

  return { link, status, refresh, createLink, revokeLink }
}
