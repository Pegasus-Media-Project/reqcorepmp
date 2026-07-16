<script setup lang="ts">
import { Users } from 'lucide-vue-next'

interface ReviewerProgress {
  id: string
  name: string | null
  email: string
  screeningCount: number
  interviewCount: number
  totalApplicants: number
}

const props = defineProps<{
  progress: ReviewerProgress[]
  /** Compact heading style for embedding in settings. */
  title?: string
}>()

function pct(count: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((count / total) * 100)
}

const sorted = computed(() =>
  [...props.progress].sort((a, b) =>
    (b.screeningCount + b.interviewCount) - (a.screeningCount + a.interviewCount),
  ),
)
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-3">
      <Users class="size-4 text-surface-400 dark:text-surface-500" />
      <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ title ?? 'Reviewer progress' }}</h3>
    </div>
    <p v-if="sorted.length === 0" class="text-sm text-surface-400 italic">No reviews submitted yet.</p>
    <ul v-else class="space-y-3">
      <li v-for="r in sorted" :key="r.id" class="text-sm">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="truncate font-medium text-surface-800 dark:text-surface-200">{{ r.name ?? r.email }}</span>
          <span class="shrink-0 text-xs text-surface-400 tabular-nums">
            S {{ r.screeningCount }}/{{ r.totalApplicants }} · I {{ r.interviewCount }}/{{ r.totalApplicants }}
          </span>
        </div>
        <div class="flex gap-2">
          <div class="flex-1">
            <div class="h-1.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
              <div class="h-full rounded-full bg-blue-500" :style="{ width: `${pct(r.screeningCount, r.totalApplicants)}%` }" />
            </div>
          </div>
          <div class="flex-1">
            <div class="h-1.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
              <div class="h-full rounded-full bg-violet-500" :style="{ width: `${pct(r.interviewCount, r.totalApplicants)}%` }" />
            </div>
          </div>
        </div>
      </li>
    </ul>
    <div v-if="sorted.length" class="mt-2 flex items-center gap-3 text-[10px] text-surface-400">
      <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-blue-500" /> Screening</span>
      <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-violet-500" /> Interview</span>
    </div>
  </div>
</template>
