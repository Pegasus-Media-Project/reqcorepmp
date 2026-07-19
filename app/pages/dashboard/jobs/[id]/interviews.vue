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
</script>

<template>
  <InterviewsBoard :job-id="jobId" />
</template>
