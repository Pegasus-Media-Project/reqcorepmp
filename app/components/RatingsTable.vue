<script setup lang="ts">
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ArrowUpDown, PanelRight } from 'lucide-vue-next'

interface ReviewerRow {
  reviewerId: string
  reviewerName: string | null
  reviewerEmail: string
  stage: 'screening' | 'interview'
  rating: number | null
  notes: string | null
}
interface Applicant {
  applicationId: string
  candidateName: string
  firstName: string
  lastName: string
  candidateEmail: string
  status: string
  nextInterviewAt: string | null
  screeningAvg: number | null
  interviewAvg: number | null
  overallAvg: number | null
  screeningCount: number
  interviewCount: number
  reviewCount: number
  reviews: ReviewerRow[]
}
interface ReviewerProgress {
  id: string
  name: string | null
  email: string
  screeningCount: number
  interviewCount: number
  totalApplicants: number
}

const props = defineProps<{
  applicants: Applicant[]
  reviewerProgress?: ReviewerProgress[]
  /** When set, renders the export menu (e.g. `/api/jobs/:id/reviews/export`). */
  exportBase?: string
}>()

// ── Selection + export ──
// Rows are ticked to export a subset; with none ticked, the export covers every
// applicant on the job.
const selectedIds = ref<Set<string>>(new Set())

function toggleSelected(applicationId: string) {
  const next = new Set(selectedIds.value)
  if (next.has(applicationId)) next.delete(applicationId)
  else next.add(applicationId)
  selectedIds.value = next
}

const allSelected = computed(() =>
  props.applicants.length > 0 && selectedIds.value.size === props.applicants.length)

function toggleSelectAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(props.applicants.map(a => a.applicationId))
}

// A different job's applicants are a different set — drop stale ticks.
watch(() => props.applicants, () => { selectedIds.value = new Set() })

const { busy: exporting, download } = useFileExport()

function onExport({ format, scope }: { format: 'xlsx' | 'pdf', scope: 'all' | 'selected' }) {
  if (!props.exportBase) return
  download(
    props.exportBase,
    { format, ...(scope === 'selected' ? { applicationIds: [...selectedIds.value] } : {}) },
    `ratings-export.${format}`,
  )
}

function fmt(v: number | null): string {
  return v == null ? '—' : v.toFixed(1)
}

const statusClasses: Record<string, string> = {
  new: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
  screening: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  interview: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  waitlist: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  offer: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  hired: 'bg-success-100 text-success-700 dark:bg-success-950/50 dark:text-success-300',
  rejected: 'bg-danger-100 text-danger-700 dark:bg-danger-950/50 dark:text-danger-300',
}

// ── Expand / collapse ──
const expanded = ref<Set<string>>(new Set())
function toggle(id: string) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}
const allExpanded = computed(() => props.applicants.length > 0 && expanded.value.size === props.applicants.length)
function toggleAll() {
  expanded.value = allExpanded.value ? new Set() : new Set(props.applicants.map(a => a.applicationId))
}

// ── Sorting ──
type SortKey = 'overall' | 'screening' | 'interview' | 'nextInterview' | 'firstName' | 'lastName'
const sortKey = ref<SortKey>('overall')
const sortDir = ref<'asc' | 'desc'>('desc')
const SORT_OPTIONS: { key: SortKey, label: string }[] = [
  { key: 'overall', label: 'Overall rating' },
  { key: 'screening', label: 'Screening rating' },
  { key: 'interview', label: 'Interview rating' },
  { key: 'nextInterview', label: 'Interview schedule' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
]
function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortDir.value = key === 'firstName' || key === 'lastName' ? 'asc' : 'desc'
  }
}

const sortedApplicants = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  const numeric = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v)
  return [...props.applicants].sort((a, b) => {
    switch (sortKey.value) {
      case 'screening': return (numeric(a.screeningAvg) - numeric(b.screeningAvg)) * dir
      case 'interview': return (numeric(a.interviewAvg) - numeric(b.interviewAvg)) * dir
      case 'nextInterview': {
        const av = a.nextInterviewAt ? new Date(a.nextInterviewAt).getTime() : Number.NEGATIVE_INFINITY
        const bv = b.nextInterviewAt ? new Date(b.nextInterviewAt).getTime() : Number.NEGATIVE_INFINITY
        return (av - bv) * dir
      }
      case 'firstName': return a.firstName.localeCompare(b.firstName) * dir
      case 'lastName': return a.lastName.localeCompare(b.lastName) * dir
      default: return (numeric(a.overallAvg) - numeric(b.overallAvg)) * dir
    }
  })
})

function fmtInterview(v: string | null): string {
  if (!v) return '—'
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Application drawer (tweak 7) ──
const drawerApplicationId = ref<string | null>(null)
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          @click="toggleAll"
        >
          <component :is="allExpanded ? ChevronsDownUp : ChevronsUpDown" class="size-4" />
          {{ allExpanded ? 'Collapse all' : 'Expand all' }}
        </button>

        <!-- Sort -->
        <div class="relative">
          <label class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300">
            <ArrowUpDown class="size-4" />
            <span class="text-surface-400">Sort</span>
            <select
              :value="sortKey"
              class="bg-transparent focus:outline-none cursor-pointer"
              @change="setSort(($event.target as HTMLSelectElement).value as SortKey)"
            >
              <option v-for="o in SORT_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
          </label>
          <button
            class="ml-1 rounded-lg border border-surface-200 dark:border-surface-700/80 bg-white dark:bg-surface-900 px-2 py-2 text-xs text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800"
            :title="sortDir === 'asc' ? 'Ascending' : 'Descending'"
            @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
          >
            {{ sortDir === 'asc' ? '↑' : '↓' }}
          </button>
        </div>
      </div>

      <ExportMenu
        v-if="exportBase"
        :selected-count="selectedIds.size"
        :total-count="applicants.length"
        :busy="exporting"
        :scope-labels="{ all: 'All applicants', selected: 'Selected applicants' }"
        @export="onExport"
      />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4 items-start">
      <!-- Table -->
      <div>
        <div
          v-if="applicants.length === 0"
          class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-10 text-center text-sm text-surface-500 dark:text-surface-400"
        >
          No applicants yet.
        </div>

        <div v-else class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-surface-100 dark:border-surface-800">
                <th class="w-8" />
                <th class="w-10 px-2 py-3">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    aria-label="Select all applicants"
                    class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
                    @click.stop="toggleSelectAll"
                  />
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Applicant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Stage</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Interview</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg Screening</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg Interview</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Overall</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
              <template v-for="a in sortedApplicants" :key="a.applicationId">
                <tr class="hover:bg-surface-50/60 dark:hover:bg-surface-900/40 cursor-pointer" @click="toggle(a.applicationId)">
                  <td class="pl-3 text-surface-400">
                    <ChevronRight class="size-4 transition-transform" :class="expanded.has(a.applicationId) ? 'rotate-90' : ''" />
                  </td>
                  <td class="px-2 py-3">
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(a.applicationId)"
                      :aria-label="`Select ${a.candidateName}`"
                      class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
                      @click.stop="toggleSelected(a.applicationId)"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <span class="font-medium text-surface-900 dark:text-surface-100">{{ a.candidateName }}</span>
                    <div class="text-xs text-surface-400 dark:text-surface-500">{{ a.candidateEmail }}</div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="statusClasses[a.status] ?? statusClasses.new">
                      {{ a.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">{{ fmtInterview(a.nextInterviewAt) }}</td>
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
                  <td class="px-2 py-3">
                    <button
                      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 hover:text-brand-600 dark:hover:bg-surface-800 transition-colors whitespace-nowrap"
                      title="Open application"
                      @click.stop="drawerApplicationId = a.applicationId"
                    >
                      <PanelRight class="size-3.5" />
                      Application
                    </button>
                  </td>
                </tr>
                <!-- Per-reviewer breakdown -->
                <tr v-if="expanded.has(a.applicationId)">
                  <td colspan="9" class="bg-surface-50/50 dark:bg-surface-900/30 px-4 py-3">
                    <div v-if="a.reviews.length === 0" class="text-xs text-surface-400 dark:text-surface-500 pl-8">No reviews yet.</div>
                    <div v-else class="space-y-2 pl-8">
                      <div v-for="r in a.reviews" :key="r.reviewerId + r.stage" class="flex items-start gap-3 text-sm">
                        <span class="w-24 shrink-0 text-xs font-medium capitalize text-surface-500 dark:text-surface-400">{{ r.stage }}</span>
                        <span class="w-40 shrink-0 truncate text-surface-700 dark:text-surface-200">{{ r.reviewerName ?? r.reviewerEmail }}</span>
                        <span class="shrink-0">
                          <StarRating v-if="r.rating != null" :model-value="r.rating" readonly :size="13" />
                          <span v-else class="text-xs text-surface-400">—</span>
                        </span>
                        <span v-if="r.notes" class="text-surface-600 dark:text-surface-300 whitespace-pre-wrap">{{ r.notes }}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reviewer progress -->
      <div
        v-if="reviewerProgress && reviewerProgress.length"
        class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4"
      >
        <ReviewerProgressPanel :progress="reviewerProgress" />
      </div>
    </div>

    <ApplicationDetailDrawer
      v-if="drawerApplicationId"
      :application-id="drawerApplicationId"
      @close="drawerApplicationId = null"
    />
  </div>
</template>
