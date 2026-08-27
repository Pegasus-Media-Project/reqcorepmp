<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const jobId = route.params.id as string

// Job info for the SEO title (matches the other job tab pages).
const { data: jobData } = useFetch(
  () => `/api/jobs/${jobId}`,
  {
    key: `interviews-job-${jobId}`,
    headers: useRequestHeaders(['cookie']),
  },
)

useSeoMeta({
  title: computed(() =>
    jobData.value ? `Interviews — ${jobData.value.title} — Pegasus Media Project` : 'Interviews — Pegasus Media Project',
  ),
  robots: 'noindex, nofollow',
})

// Board (scheduled interviews) vs Signup (join slots / set availability).
// `?view=signup` deep-links straight to the signup view.
const view = ref<'board' | 'signup'>(route.query.view === 'signup' ? 'signup' : 'board')
</script>

<template>
  <div>
    <InterviewsBoard v-if="view === 'board'" :job-id="jobId">
      <template #views>
        <InterviewViewTabs v-model="view" />
      </template>
    </InterviewsBoard>

    <div v-else class="mx-auto max-w-5xl">
      <InterviewViewTabs v-model="view" class="mb-4" />
      <p class="text-sm text-surface-500 dark:text-surface-400 mb-6 max-w-xl">
        Join individual interview slots for this job, or set your availability and get assigned to everything inside it automatically.
      </p>
      <ReviewerSignupPanel :job-id="jobId" />
    </div>
  </div>
</template>
