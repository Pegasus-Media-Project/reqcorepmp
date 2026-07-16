<script setup lang="ts">
import { Star } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Ratings — Pegasus Media Project',
  robots: 'noindex, nofollow',
})

// Scoped jobs list (guests see only their assigned jobs).
const { data: jobsData, status: jobsStatus } = useFetch<{ data: { id: string, title: string, status: string }[] }>(
  '/api/jobs',
  { key: 'ratings-jobs', query: { limit: 100 }, headers: useRequestHeaders(['cookie']) },
)
const jobs = computed(() => jobsData.value?.data ?? [])

// Remember the last selected job across navigation.
const selectedJobId = useState<string | null>('ratings-selected-job', () => null)
watchEffect(() => {
  if (!selectedJobId.value && jobs.value.length) {
    selectedJobId.value = jobs.value[0]!.id
  }
})

const { data: aggregate, status: aggStatus, error: aggError } = useFetch(
  () => selectedJobId.value ? `/api/jobs/${selectedJobId.value}/reviews` : null!,
  {
    key: computed(() => `ratings-agg-${selectedJobId.value}`),
    headers: useRequestHeaders(['cookie']),
    watch: [selectedJobId],
    immediate: false,
  },
)
watch(selectedJobId, (id) => { if (id) refreshNuxtData(`ratings-agg-${id}`) }, { immediate: true })

const applicants = computed(() => aggregate.value?.applicants ?? [])
const reviewerProgress = computed(() => aggregate.value?.reviewerProgress ?? [])
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
          <Star class="size-5 text-amber-400" /> Ratings
        </h1>
        <p class="text-xs text-surface-500 dark:text-surface-400">Reviewer scores per stage for a job's applicants.</p>
      </div>
      <label class="inline-flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-3 py-2 text-sm">
        <span class="text-surface-400">Job</span>
        <select
          v-model="selectedJobId"
          class="bg-transparent font-medium text-surface-800 dark:text-surface-200 focus:outline-none cursor-pointer max-w-[240px] truncate"
        >
          <option v-for="j in jobs" :key="j.id" :value="j.id">{{ j.title }}</option>
        </select>
      </label>
    </div>

    <div v-if="jobsStatus === 'pending'" class="py-12 text-center text-sm text-surface-400">Loading…</div>
    <div v-else-if="jobs.length === 0" class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-10 text-center text-sm text-surface-500 dark:text-surface-400">
      No jobs available.
    </div>

    <template v-else>
      <div v-if="aggError" class="rounded-xl border border-danger-200/80 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-800/60 dark:bg-danger-950/40 dark:text-danger-300">
        Failed to load ratings.
      </div>
      <div v-else-if="aggStatus === 'pending' && !aggregate" class="py-12 text-center text-sm text-surface-400">Loading ratings…</div>
      <RatingsTable
        v-else
        :applicants="applicants"
        :reviewer-progress="reviewerProgress"
        :export-base="selectedJobId ? `/api/jobs/${selectedJobId}/reviews/export` : undefined"
      />
    </template>
  </div>
</template>
