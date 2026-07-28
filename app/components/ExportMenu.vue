<script setup lang="ts">
import { Download, FileSpreadsheet, FileText, Loader2, Check } from 'lucide-vue-next'

/**
 * One export control, shared by the applications table, the job pipeline, the
 * ratings table and the interviews board.
 *
 * The caller owns the request; this only asks the two questions every surface
 * shares — what to export, and in which format — and reports the answer.
 * Surfaces that count in something other than people (the interviews board
 * counts days) relabel the scopes.
 */
export type ExportFormat = 'xlsx' | 'pdf'
export type ExportScope = 'all' | 'selected'

const props = withDefaults(defineProps<{
  /** How many rows are ticked. Zero disables the "selected" scope. */
  selectedCount?: number
  /** Total available, shown next to "Everything" when known. */
  totalCount?: number
  /** Wording for the two scopes, e.g. { selected: 'Selected days' }. */
  scopeLabels?: { all?: string, selected?: string }
  busy?: boolean
  disabled?: boolean
  /** Compact trigger for toolbars that are already crowded. */
  compact?: boolean
}>(), {
  selectedCount: 0,
  compact: false,
})

const emit = defineEmits<{
  (e: 'export', payload: { format: ExportFormat, scope: ExportScope }): void
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const allLabel = computed(() => props.scopeLabels?.all ?? 'Everything')
const selectedLabel = computed(() => props.scopeLabels?.selected ?? 'Selected')
const hasSelection = computed(() => props.selectedCount > 0)

/** Default to whichever scope the user has already expressed an interest in. */
const scope = ref<ExportScope>('all')
watch(() => props.selectedCount, (count) => {
  scope.value = count > 0 ? 'selected' : 'all'
}, { immediate: true })

function choose(format: ExportFormat) {
  emit('export', { format, scope: scope.value })
  open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      :disabled="disabled || busy"
      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      :title="'Export'"
      @click.stop="open = !open"
    >
      <Loader2 v-if="busy" class="size-4 animate-spin" />
      <Download v-else class="size-4" />
      <span :class="compact ? 'hidden sm:inline' : ''">{{ busy ? 'Exporting…' : 'Export' }}</span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-1.5 shadow-lg"
    >
      <!-- What to export -->
      <p class="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
        What to export
      </p>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        @click="scope = 'all'"
      >
        <Check class="size-3.5 shrink-0" :class="scope === 'all' ? 'text-brand-600' : 'invisible'" />
        {{ allLabel }}
        <span v-if="totalCount !== undefined" class="ml-auto text-xs text-surface-400">{{ totalCount }}</span>
      </button>
      <button
        type="button"
        :disabled="!hasSelection"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        @click="scope = 'selected'"
      >
        <Check class="size-3.5 shrink-0" :class="scope === 'selected' ? 'text-brand-600' : 'invisible'" />
        {{ selectedLabel }}
        <span class="ml-auto text-xs text-surface-400">{{ selectedCount }}</span>
      </button>

      <div class="my-1.5 border-t border-surface-100 dark:border-surface-800" />

      <!-- Format — picking one runs the export -->
      <p class="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
        Download as
      </p>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        @click="choose('xlsx')"
      >
        <FileSpreadsheet class="size-4 text-success-600 dark:text-success-400" />
        Excel spreadsheet
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        @click="choose('pdf')"
      >
        <FileText class="size-4 text-danger-500 dark:text-danger-400" />
        PDF
      </button>
    </div>
  </div>
</template>
