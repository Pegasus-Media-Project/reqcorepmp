<script setup lang="ts">
import { Upload, X } from 'lucide-vue-next'
import { sanitizeNumberInput, isNumericText } from '~~/shared/fieldFormats'

/**
 * Renders a custom question as the appropriate form field based on its type.
 * Used on the public application form to display recruiter-configured questions.
 *
 * For `file_upload` type questions, emits `file-selected` with the File object.
 * The model value will be set to `"pending:<filename>"` to track selection state.
 */
const props = defineProps<{
  question: {
    id: string
    type: string
    label: string
    description?: string | null
    required: boolean
    options?: string[] | null
    config?: {
      ratingMax?: number
      ratingMinLabel?: string | null
      ratingMaxLabel?: string | null
    } | null
  }
  error?: string
}>()

const emit = defineEmits<{
  (e: 'file-selected', questionId: string, file: File | null): void
}>()

const model = defineModel<string | string[] | number | boolean | Record<string, number> | undefined>()

const { t } = useI18n()

// String-coerced model for text inputs (avoids TS error with boolean in v-model on <input>)
const stringModel = computed({
  get: () => (model.value as string) ?? '',
  set: (v: string) => { model.value = v },
})

/**
 * `number` questions render as a text input with a numeric keypad rather than
 * `type="number"`: browsers disagree on what a number input accepts (Firefox
 * takes letters, Chrome allows `e` and `+`), and only a text input can be
 * sanitized on the way in. `numberText` holds what's on screen — including
 * part-typed values like `-` or `12.` — while the model holds the parsed number.
 */
const numberText = ref(typeof model.value === 'number' ? String(model.value) : '')

function onNumberInput(event: Event) {
  const el = event.target as HTMLInputElement
  const cleaned = sanitizeNumberInput(el.value)
  // Write straight back so a rejected character never shows, even briefly.
  if (el.value !== cleaned) el.value = cleaned
  numberText.value = cleaned
  model.value = isNumericText(cleaned) ? Number(cleaned) : undefined
}

// Keep the field in step when the parent resets the answer (e.g. a branch
// closing), without disturbing a value the applicant is mid-way through typing.
watch(() => model.value, (value) => {
  if (props.question.type !== 'number') return
  if (typeof value === 'number') {
    if (Number(numberText.value) !== value) numberText.value = String(value)
  } else if (isNumericText(numberText.value)) {
    numberText.value = ''
  }
})

const booleanModel = computed({
  get: () => (model.value as boolean) ?? false,
  set: (v: boolean) => { model.value = v },
})

// For multi_select, ensure model value is always an array
if (props.question.type === 'multi_select' && !Array.isArray(model.value)) {
  model.value = []
}

// For checkbox, ensure model value is always a boolean
if (props.question.type === 'checkbox' && typeof model.value !== 'boolean') {
  model.value = false
}

function toggleMultiOption(option: string) {
  const current = Array.isArray(model.value) ? [...model.value] : []
  const idx = current.indexOf(option)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(option)
  }
  model.value = current
}

function isOptionSelected(option: string): boolean {
  return Array.isArray(model.value) && model.value.includes(option)
}

// ─────────────────────────────────────────────
// Rating grid: one row per item in `options`, one column per point on the
// scale. The answer is a { row label → rating } map.
// ─────────────────────────────────────────────

const DEFAULT_RATING_MAX = 5

const ratingColumns = computed(() => {
  const max = props.question.config?.ratingMax ?? DEFAULT_RATING_MAX
  return Array.from({ length: max }, (_, i) => i + 1)
})

/** Column heading: the endpoints carry their captions, the rest are numbers. */
function ratingColumnLabel(value: number): string {
  const cfg = props.question.config
  if (value === 1 && cfg?.ratingMinLabel) return `1 – ${cfg.ratingMinLabel}`
  if (value === ratingColumns.value.length && cfg?.ratingMaxLabel) return `${value} – ${cfg.ratingMaxLabel}`
  return String(value)
}

/**
 * The rows to rate. Shared with validation so the grid and the "answer this"
 * check can never disagree about what has to be scored.
 */
const ratingRowLabels = computed(() => ratingRows(props.question))

const ratings = computed<Record<string, number>>(() =>
  (model.value && typeof model.value === 'object' && !Array.isArray(model.value))
    ? model.value as Record<string, number>
    : {},
)

function setRating(row: string, value: number) {
  model.value = { ...ratings.value, [row]: value }
}

// ─────────────────────────────────────────────
// File upload handling
// ─────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFileName = ref<string | null>(null)

/** Accepted file types for file_upload questions */
const acceptedFileTypes = '.pdf,.doc,.docx'

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null

  if (file) {
    selectedFileName.value = file.name
    // Store a marker in the model so required-field validation knows a file is selected
    model.value = `pending:${file.name}`
    emit('file-selected', props.question.id, file)
  } else {
    clearFile()
  }
}

function clearFile() {
  selectedFileName.value = null
  model.value = undefined
  emit('file-selected', props.question.id, null)
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const inputClasses = 'w-full rounded-lg border px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors'
const errorBorderClass = 'border-danger-300 dark:border-danger-700'
const normalBorderClass = 'border-surface-300 dark:border-surface-700'
</script>

<template>
  <div>
    <label :for="`q-${question.id}`" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
      {{ question.label }}
      <span v-if="question.required" class="text-danger-500">*</span>
    </label>

    <!-- Short Text -->
    <input
      v-if="question.type === 'short_text'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="text"
      :required="question.required"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Long Text -->
    <textarea
      v-else-if="question.type === 'long_text'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      rows="4"
      :required="question.required"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Single Select -->
    <select
      v-else-if="question.type === 'single_select'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      :required="question.required"
      :class="[inputClasses, 'bg-white dark:bg-surface-900', error ? errorBorderClass : normalBorderClass]"
    >
      <option value="" disabled>{{ t('jobs.question.selectOption') }}</option>
      <option v-for="opt in question.options" :key="opt" :value="opt">
        {{ opt }}
      </option>
    </select>

    <!-- Multi Select (checkboxes) -->
    <div v-else-if="question.type === 'multi_select'" class="space-y-2 mt-1">
      <label
        v-for="opt in question.options"
        :key="opt"
        class="flex items-center gap-2 cursor-pointer"
      >
        <input
          type="checkbox"
          :checked="isOptionSelected(opt)"
          class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
          @change="toggleMultiOption(opt)"
        />
        <span class="text-sm text-surface-700 dark:text-surface-300">{{ opt }}</span>
      </label>
    </div>

    <!-- Rating grid: nothing to score means the question was misconfigured —
         say so rather than showing an empty table with no way to answer. -->
    <p
      v-else-if="question.type === 'rating' && ratingRowLabels.length === 0"
      class="mt-1 text-sm text-surface-500 dark:text-surface-400"
    >
      {{ t('jobs.question.ratingNoItems') }}
    </p>

    <!-- Rating grid -->
    <div
      v-else-if="question.type === 'rating'"
      class="mt-1 overflow-x-auto rounded-lg border"
      :class="error ? errorBorderClass : normalBorderClass"
    >
      <table class="w-full min-w-md border-collapse text-sm">
        <thead>
          <tr class="border-b border-surface-200 dark:border-surface-800">
            <th class="sticky left-0 z-10 bg-white dark:bg-surface-900 px-3 py-2 text-left text-xs font-medium text-surface-500 dark:text-surface-400" />
            <th
              v-for="col in ratingColumns"
              :key="col"
              scope="col"
              class="px-2 py-2 text-center text-xs font-medium text-surface-500 dark:text-surface-400 whitespace-nowrap"
            >
              {{ ratingColumnLabel(col) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in ratingRowLabels"
            :key="row"
            class="border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <th
              scope="row"
              class="sticky left-0 z-10 bg-white dark:bg-surface-900 px-3 py-2 text-left text-sm font-normal text-surface-700 dark:text-surface-300"
            >
              {{ row }}
            </th>
            <td v-for="col in ratingColumns" :key="col" class="px-2 py-2 text-center">
              <input
                type="radio"
                :name="`q-${question.id}-${rowIndex}`"
                :value="col"
                :checked="ratings[row] === col"
                :aria-label="`${row}: ${ratingColumnLabel(col)}`"
                class="size-4 border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
                @change="setRating(row, col)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Number (text input so non-numeric characters can be refused outright) -->
    <input
      v-else-if="question.type === 'number'"
      :id="`q-${question.id}`"
      :value="numberText"
      type="text"
      inputmode="decimal"
      :required="question.required"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
      @input="onNumberInput"
    />

    <!-- Date -->
    <input
      v-else-if="question.type === 'date'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="date"
      :required="question.required"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- URL -->
    <input
      v-else-if="question.type === 'url'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="url"
      :placeholder="t('jobs.question.urlPlaceholder')"
      :required="question.required"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Checkbox (boolean) -->
    <label v-else-if="question.type === 'checkbox'" class="flex items-center gap-2 mt-1 cursor-pointer">
      <input
        :id="`q-${question.id}`"
        v-model="booleanModel"
        type="checkbox"
        class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
      />
      <span class="text-sm text-surface-700 dark:text-surface-300">{{ t('jobs.question.yes') }}</span>
    </label>

    <!-- File Upload -->
    <div v-else-if="question.type === 'file_upload'" class="mt-1">
      <input
        ref="fileInputRef"
        type="file"
        :accept="acceptedFileTypes"
        class="hidden"
        @change="handleFileChange"
      />

      <!-- No file selected -->
      <button
        v-if="!selectedFileName"
        type="button"
        class="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors w-full justify-center"
        :class="error ? 'border-danger-300 dark:border-danger-700 text-danger-600 dark:text-danger-400' : 'border-surface-300 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400'"
        @click="fileInputRef?.click()"
      >
        <Upload class="size-4" />
        {{ t('jobs.question.chooseFileHint') }}
      </button>

      <!-- File selected -->
      <div
        v-else
        class="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
        :class="error ? 'border-danger-300 dark:border-danger-700' : 'border-surface-300 dark:border-surface-700'"
      >
        <span class="text-surface-700 dark:text-surface-300 truncate mr-2">{{ selectedFileName }}</span>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 text-surface-400 hover:text-danger-600 transition-colors"
          @click="clearFile"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- Help text -->
    <p v-if="question.description" class="mt-1 text-xs text-surface-400">
      {{ question.description }}
    </p>

    <!-- Error message -->
    <p v-if="error" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ error }}</p>
  </div>
</template>
