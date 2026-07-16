<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const jobId = route.params.id as string

const { data, status, error } = useFetch(() => `/api/jobs/${jobId}/reviews`, {
  key: `job-ratings-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

useSeoMeta({
  title: computed(() =>
    data.value?.jobTitle ? `Ratings — ${data.value.jobTitle} — Pegasus Media Project` : 'Ratings — Pegasus Media Project',
  ),
})

const applicants = computed(() => data.value?.applicants ?? [])
const reviewerProgress = computed(() => data.value?.reviewerProgress ?? [])
const isLoading = computed(() => status.value === 'pending')
</script>

<template>
  <div class="-mb-6 flex h-[calc(100%+1.5rem)] flex-col lg:-mb-8 lg:h-[calc(100%+2rem)]">
    <JobSubNavActions :job-id="jobId" />

    <div v-if="isLoading" class="flex flex-col items-center justify-center py-12 gap-3">
      <div class="size-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin" />
      <p class="text-sm font-medium text-surface-400 dark:text-surface-500">Loading ratings…</p>
    </div>

    <div
      v-else-if="error"
      class="rounded-xl border border-danger-200/80 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-800/60 dark:bg-danger-950/40 dark:text-danger-300"
    >
      Failed to load ratings.
    </div>

    <div v-else>
      <div class="mb-4">
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Ratings</h1>
        <p class="text-xs text-surface-500 dark:text-surface-400">Average reviewer scores per stage for every applicant.</p>
      </div>
      <RatingsTable
        :applicants="applicants"
        :reviewer-progress="reviewerProgress"
        :export-base="`/api/jobs/${jobId}/reviews/export`"
      />
    </div>
  </div>
</template>
