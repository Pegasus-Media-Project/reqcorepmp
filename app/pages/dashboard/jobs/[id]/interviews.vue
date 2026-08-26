<script setup lang="ts">
import { CalendarClock, CalendarDays } from 'lucide-vue-next'

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
    <!-- View switcher — same container as the views below it, so the tabs line
         up with the board's search row and cards. -->
    <div class="mx-auto mb-4 max-w-5xl">
      <div class="inline-flex overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
        <button
          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-all cursor-pointer"
          :class="view === 'board'
            ? 'bg-brand-600 text-white'
            : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700'"
          @click="view = 'board'"
        >
          <CalendarDays class="size-3.5" />
          Interviews
        </button>
        <button
          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-all cursor-pointer"
          :class="view === 'signup'
            ? 'bg-brand-600 text-white'
            : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700'"
          @click="view = 'signup'"
        >
          <CalendarClock class="size-3.5" />
          Interview Signup
        </button>
      </div>
    </div>

    <InterviewsBoard v-if="view === 'board'" :job-id="jobId" />
    <div v-else class="mx-auto max-w-5xl">
      <p class="text-sm text-surface-500 dark:text-surface-400 mb-6 max-w-xl">
        Join individual interview slots for this job, or set your availability and get assigned to everything inside it automatically.
      </p>
      <ReviewerSignupPanel :job-id="jobId" />
    </div>
  </div>
</template>
