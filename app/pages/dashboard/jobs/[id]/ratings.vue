<script setup lang="ts">
import { ChevronRight, FileSpreadsheet, FileText } from 'lucide-vue-next'

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
const isLoading = computed(() => status.value === 'pending')

const expanded = ref<Set<string>>(new Set())
function toggle(id: string) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

function fmt(v: number | null): string {
  return v === null ? '—' : v.toFixed(1)
}

const statusClasses: Record<string, string> = {
  new: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
  screening: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  interview: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  offer: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  hired: 'bg-success-100 text-success-700 dark:bg-success-950/50 dark:text-success-300',
  rejected: 'bg-danger-100 text-danger-700 dark:bg-danger-950/50 dark:text-danger-300',
}

const exportBase = computed(() => `/api/jobs/${jobId}/reviews/export`)
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

    <template v-else>
      <!-- Toolbar -->
      <div class="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Ratings</h1>
          <p class="text-xs text-surface-500 dark:text-surface-400">Average reviewer scores per stage for every applicant.</p>
        </div>
        <div class="flex items-center gap-2">
          <a
            :href="`${exportBase}?format=csv`"
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 hover:border-surface-300 dark:hover:bg-surface-800 dark:hover:border-surface-600 transition-all duration-150 shadow-sm"
          >
            <FileText class="size-4" />
            CSV
          </a>
          <a
            :href="`${exportBase}?format=xlsx`"
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 hover:border-surface-300 dark:hover:bg-surface-800 dark:hover:border-surface-600 transition-all duration-150 shadow-sm"
          >
            <FileSpreadsheet class="size-4" />
            Excel
          </a>
        </div>
      </div>

      <!-- Empty -->
      <div
        v-if="applicants.length === 0"
        class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-10 text-center text-sm text-surface-500 dark:text-surface-400"
      >
        No applicants yet.
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-100 dark:border-surface-800">
              <th class="w-8" />
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Applicant</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Stage</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg Screening</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg Interview</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Overall</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Reviews</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
            <template v-for="a in applicants" :key="a.applicationId">
              <tr
                class="hover:bg-surface-50/60 dark:hover:bg-surface-900/40 cursor-pointer"
                @click="toggle(a.applicationId)"
              >
                <td class="pl-3 text-surface-400">
                  <ChevronRight class="size-4 transition-transform" :class="expanded.has(a.applicationId) ? 'rotate-90' : ''" />
                </td>
                <td class="px-4 py-3">
                  <NuxtLink
                    :to="$localePath(`/dashboard/applications/${a.applicationId}`)"
                    class="font-medium text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400"
                    @click.stop
                  >
                    {{ a.candidateName }}
                  </NuxtLink>
                  <div class="text-xs text-surface-400 dark:text-surface-500">{{ a.candidateEmail }}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="statusClasses[a.status] ?? statusClasses.new">
                    {{ a.status }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1.5">
                    <StarRating :model-value="a.screeningAvg" readonly :size="14" />
                    <span class="text-surface-600 dark:text-surface-300 tabular-nums">{{ fmt(a.screeningAvg) }}</span>
                    <span v-if="a.screeningCount" class="text-xs text-surface-400">({{ a.screeningCount }})</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1.5">
                    <StarRating :model-value="a.interviewAvg" readonly :size="14" />
                    <span class="text-surface-600 dark:text-surface-300 tabular-nums">{{ fmt(a.interviewAvg) }}</span>
                    <span v-if="a.interviewCount" class="text-xs text-surface-400">({{ a.interviewCount }})</span>
                  </div>
                </td>
                <td class="px-4 py-3 font-medium text-surface-700 dark:text-surface-200 tabular-nums">{{ fmt(a.overallAvg) }}</td>
                <td class="px-4 py-3 text-surface-500 dark:text-surface-400 tabular-nums">{{ a.reviewCount }}</td>
              </tr>
              <!-- Per-reviewer breakdown -->
              <tr v-if="expanded.has(a.applicationId)">
                <td colspan="7" class="bg-surface-50/50 dark:bg-surface-900/30 px-4 py-3">
                  <div v-if="a.reviews.length === 0" class="text-xs text-surface-400 dark:text-surface-500 pl-8">No reviews yet.</div>
                  <div v-else class="space-y-2 pl-8">
                    <div
                      v-for="r in a.reviews"
                      :key="r.reviewerId + r.stage"
                      class="flex items-start gap-3 text-sm"
                    >
                      <span class="w-24 shrink-0 text-xs font-medium capitalize text-surface-500 dark:text-surface-400">{{ r.stage }}</span>
                      <span class="w-40 shrink-0 truncate text-surface-700 dark:text-surface-200">{{ r.reviewerName ?? r.reviewerEmail }}</span>
                      <span class="shrink-0">
                        <StarRating v-if="r.rating != null" :model-value="r.rating" readonly :size="13" />
                        <span v-else class="text-xs text-surface-400">—</span>
                      </span>
                      <span v-if="r.notes" class="text-surface-600 dark:text-surface-300">{{ r.notes }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
