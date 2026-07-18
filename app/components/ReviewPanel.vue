<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import type { ReviewStage } from '~/composables/useReviews'

const props = defineProps<{
  applicationId: string
  /** Current pipeline status — used to highlight the relevant stage. */
  status?: string
}>()

const toast = useToast()
const { reviews, myReview, saveReview, currentUserId } = useReviews(() => props.applicationId)

const STAGES: { key: ReviewStage, label: string }[] = [
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
]

// The interview review only appears once the applicant has reached the
// interview stage (interview / waitlist / offer / hired). Screening is always available.
const INTERVIEW_REACHED = new Set(['interview', 'waitlist', 'offer', 'hired'])
const visibleStages = computed(() =>
  STAGES.filter(s => s.key !== 'interview' || INTERVIEW_REACHED.has(props.status ?? '')),
)

// Local editable state per stage, seeded from the user's existing review.
interface Draft { rating: number | null, notes: string }
const drafts = reactive<Record<ReviewStage, Draft>>({
  screening: { rating: null, notes: '' },
  interview: { rating: null, notes: '' },
})
const saving = reactive<Record<ReviewStage, boolean>>({ screening: false, interview: false })

function seed() {
  for (const { key } of STAGES) {
    const mine = myReview(key)
    drafts[key].rating = mine?.rating ?? null
    drafts[key].notes = mine?.notes ?? ''
  }
}
watch(reviews, seed, { immediate: true })

function isDirty(stage: ReviewStage): boolean {
  const mine = myReview(stage)
  return (drafts[stage].rating ?? null) !== (mine?.rating ?? null)
    || (drafts[stage].notes ?? '') !== (mine?.notes ?? '')
}

function canSave(stage: ReviewStage): boolean {
  return isDirty(stage) && (drafts[stage].rating != null || drafts[stage].notes.trim().length > 0)
}

async function save(stage: ReviewStage) {
  if (!canSave(stage)) return
  saving[stage] = true
  try {
    await saveReview({ stage, rating: drafts[stage].rating, notes: drafts[stage].notes.trim() || null })
    toast.success('Review saved')
  }
  catch (err: any) {
    toast.error('Failed to save review', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    saving[stage] = false
  }
}

// All reviewers' entries grouped by stage (open visibility).
function othersFor(stage: ReviewStage) {
  return reviews.value.filter(r => r.stage === stage && r.reviewerId !== currentUserId.value)
}
</script>

<template>
  <div class="space-y-6">
    <div
      v-for="s in visibleStages"
      :key="s.key"
      class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4"
      :class="status === s.key ? 'ring-1 ring-brand-300 dark:ring-brand-700' : ''"
    >
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ s.label }} review</h4>
        <span
          v-if="status === s.key"
          class="text-[10px] font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400"
        >Current stage</span>
      </div>

      <!-- Your review -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <span class="text-xs font-medium text-surface-500 dark:text-surface-400 w-16">Your rating</span>
          <StarRating v-model="drafts[s.key].rating" :size="20" />
        </div>
        <textarea
          v-model="drafts[s.key].notes"
          rows="2"
          :placeholder="`Notes for the ${s.label.toLowerCase()} stage…`"
          class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-800 dark:text-surface-200 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400"
        />
        <div class="flex justify-end">
          <button
            :disabled="!canSave(s.key) || saving[s.key]"
            class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            @click="save(s.key)"
          >
            <Check class="size-3.5" />
            {{ saving[s.key] ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>

      <!-- Other reviewers -->
      <div v-if="othersFor(s.key).length" class="mt-4 pt-3 border-t border-surface-100 dark:border-surface-800 space-y-2.5">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500">Other reviewers</p>
        <div v-for="r in othersFor(s.key)" :key="r.id" class="flex items-start gap-2.5">
          <img
            v-if="r.reviewerImage"
            :src="r.reviewerImage"
            class="size-6 rounded-full shrink-0 mt-0.5"
            :alt="r.reviewerName ?? r.reviewerEmail"
          >
          <div
            v-else
            class="size-6 rounded-full shrink-0 mt-0.5 bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-[10px] font-medium text-surface-500 dark:text-surface-300"
          >
            {{ (r.reviewerName ?? r.reviewerEmail).charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-surface-700 dark:text-surface-200 truncate">{{ r.reviewerName ?? r.reviewerEmail }}</span>
              <StarRating v-if="r.rating != null" :model-value="r.rating" readonly :size="13" />
            </div>
            <p v-if="r.notes" class="text-xs text-surface-600 dark:text-surface-300 mt-0.5 whitespace-pre-wrap">{{ r.notes }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
