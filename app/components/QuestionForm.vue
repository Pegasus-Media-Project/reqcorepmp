<script setup lang="ts">
import { X, Plus, Trash2 } from 'lucide-vue-next'

import type { VisibilityCondition } from '~~/shared/questionVisibility'

type QuestionConfig = {
  ratingMax?: number
  ratingMinLabel?: string | null
  ratingMaxLabel?: string | null
  visibleWhen?: VisibilityCondition | null
}

/** A question this one can branch off — always one that comes before it. */
type ConditionSource = {
  id: string
  label: string
  type: string
  options?: string[] | null
}

const props = defineProps<{
  /** If provided, we're editing an existing question */
  question?: {
    id: string
    label: string
    type: string
    description?: string | null
    content?: string | null
    required: boolean
    options?: string[] | null
    config?: QuestionConfig | null
  }
  /** Preselects the field type when adding a new item (e.g. 'info'). */
  initialType?: string
  /** Earlier questions with discrete answers, offered as branch conditions. */
  conditionSources?: ConditionSource[]
}>()

const emit = defineEmits<{
  (e: 'save', data: {
    label: string
    type: string
    description?: string
    content?: string
    required: boolean
    options?: string[]
    config?: QuestionConfig | null
  }): void
  (e: 'cancel'): void
}>()

const questionTypes = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'rating', label: 'Rating scale (grid)' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'file_upload', label: 'File Upload' },
  { value: 'info', label: 'Information block (no answer)' },
]

/** Default rating scale when adding a new grid. */
const DEFAULT_RATING_MAX = 5

const form = ref({
  label: props.question?.label ?? '',
  type: props.question?.type ?? props.initialType ?? 'short_text',
  description: props.question?.description ?? '',
  content: props.question?.content ?? '',
  required: props.question?.required ?? false,
  options: props.question?.options ?? [''],
  ratingMax: props.question?.config?.ratingMax ?? DEFAULT_RATING_MAX,
  ratingMinLabel: props.question?.config?.ratingMinLabel ?? '',
  ratingMaxLabel: props.question?.config?.ratingMaxLabel ?? '',
  conditionEnabled: !!props.question?.config?.visibleWhen,
  conditionQuestionId: props.question?.config?.visibleWhen?.questionId ?? '',
  conditionValues: [...(props.question?.config?.visibleWhen?.values ?? [])],
})

const errors = ref<Record<string, string>>({})

const isSelectType = computed(() =>
  form.value.type === 'single_select' || form.value.type === 'multi_select',
)

/** Rating grids reuse `options` as their rows (the things being rated). */
const isRating = computed(() => form.value.type === 'rating')

/** Both select types and rating grids collect a list of options/rows. */
const hasOptionList = computed(() => isSelectType.value || isRating.value)

const ratingScaleChoices = [2, 3, 4, 5, 6, 7, 8, 9, 10]

// ─────────────────────────────────────────────
// Branching: show this item only for certain answers to an earlier question
// ─────────────────────────────────────────────

const conditionSources = computed<ConditionSource[]>(() => props.conditionSources ?? [])

const conditionSource = computed(() =>
  conditionSources.value.find(q => q.id === form.value.conditionQuestionId) ?? null)

/** Answers of the controlling question, as pickable trigger values. */
const conditionChoices = computed<{ value: string, label: string }[]>(() => {
  const source = conditionSource.value
  if (!source) return []
  if (source.type === 'checkbox') {
    return [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
  }
  return (source.options ?? []).map(option => ({ value: option, label: option }))
})

function toggleConditionValue(value: string) {
  const index = form.value.conditionValues.indexOf(value)
  if (index >= 0) form.value.conditionValues.splice(index, 1)
  else form.value.conditionValues.push(value)
}

// Switching the controlling question invalidates whichever answers were picked.
watch(() => form.value.conditionQuestionId, () => { form.value.conditionValues = [] })

/** Preview of the columns a candidate will see. */
const ratingColumns = computed(() =>
  Array.from({ length: form.value.ratingMax }, (_, i) => i + 1),
)

/** Info blocks are display-only content, not an input field. */
const isInfo = computed(() => form.value.type === 'info')

/** True when the rich-text body has visible text or an image. */
function hasRichContent(html: string) {
  return /<img/i.test(html) || html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

function addOption() {
  if (form.value.options.length >= 50) return
  form.value.options.push('')
}

function removeOption(index: number) {
  if (form.value.options.length > 1) {
    form.value.options.splice(index, 1)
  }
}

function validate(): boolean {
  errors.value = {}

  if (form.value.conditionEnabled) {
    if (!form.value.conditionQuestionId) {
      errors.value.condition = 'Choose the question this one depends on'
    } else if (form.value.conditionValues.length === 0) {
      errors.value.condition = 'Choose at least one answer that reveals this question'
    }
  }

  if (isInfo.value) {
    // Info blocks: heading optional, rich content required.
    if (!hasRichContent(form.value.content)) {
      errors.value.content = 'Add some content for this information block'
    }
    if (form.value.label.trim().length > 500) {
      errors.value.label = 'Heading must be 500 characters or less'
    }
    return Object.keys(errors.value).length === 0
  }


  if (!form.value.label.trim()) {
    errors.value.label = 'Question label is required'
  } else if (form.value.label.trim().length > 500) {
    errors.value.label = 'Question label must be 500 characters or less'
  }

  if (form.value.description.trim().length > 1000) {
    errors.value.description = 'Help text must be 1,000 characters or less'
  }

  if (hasOptionList.value) {
    const noun = isRating.value ? 'Items' : 'Options'
    const nonEmpty = form.value.options.map(o => o.trim()).filter(Boolean)
    if (nonEmpty.length === 0) {
      errors.value.options = isRating.value
        ? 'Add at least one item to rate'
        : 'At least one option is required for select questions'
    } else if (nonEmpty.some(option => option.length > 200)) {
      errors.value.options = `${noun} must be 200 characters or less`
    } else if (new Set(nonEmpty.map(option => option.toLocaleLowerCase())).size !== nonEmpty.length) {
      errors.value.options = `${noun} must be unique`
    }
  }

  return Object.keys(errors.value).length === 0
}

/**
 * Assemble the type-specific config. Settings for a type the question no
 * longer is are dropped, so a stale rating scale can't linger.
 */
function buildConfig(): QuestionConfig | null {
  const config: QuestionConfig = {}

  if (isRating.value) {
    config.ratingMax = form.value.ratingMax
    config.ratingMinLabel = form.value.ratingMinLabel.trim() || null
    config.ratingMaxLabel = form.value.ratingMaxLabel.trim() || null
  }

  if (form.value.conditionEnabled && form.value.conditionQuestionId && form.value.conditionValues.length) {
    config.visibleWhen = {
      questionId: form.value.conditionQuestionId,
      values: [...form.value.conditionValues],
    }
  }

  return Object.keys(config).length ? config : null
}

function handleSubmit() {
  if (!validate()) return

  const data: {
    label: string
    type: string
    description?: string
    content?: string
    required: boolean
    options?: string[]
    config?: QuestionConfig | null
  } = {
    label: form.value.label.trim(),
    type: form.value.type,
    // Info blocks are never "required" — they collect no answer.
    required: isInfo.value ? false : form.value.required,
  }

  data.config = buildConfig()

  if (isInfo.value) {
    data.content = form.value.content
    emit('save', data)
    return
  }

  if (form.value.description.trim()) {
    data.description = form.value.description.trim()
  }

  if (hasOptionList.value) {
    data.options = form.value.options
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
  }

  emit('save', data)
}

const isEditing = computed(() => !!props.question)
</script>

<template>
  <div class="rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300">
        {{ isEditing ? (isInfo ? 'Edit Block' : 'Edit Question') : (isInfo ? 'Add Information Block' : 'Add Question') }}
      </h3>
      <button
        type="button"
        class="rounded p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        @click="emit('cancel')"
      >
        <X class="size-4" />
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Type -->
      <div>
        <label for="q-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Field Type
        </label>
        <select
          id="q-type"
          v-model="form.type"
          class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-white dark:bg-surface-800"
        >
          <option v-for="qt in questionTypes" :key="qt.value" :value="qt.value">
            {{ qt.label }}
          </option>
        </select>
      </div>

      <!-- Label / heading -->
      <div>
        <label for="q-label" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          <template v-if="isInfo">Heading <span class="text-surface-400 font-normal">(optional)</span></template>
          <template v-else>Question <span class="text-danger-500">*</span></template>
        </label>
        <input
          id="q-label"
          v-model="form.label"
          type="text"
          maxlength="500"
          :placeholder="isInfo ? 'Optional heading for this block' : 'e.g. How many years of experience do you have?'"
          class="w-full rounded-lg border px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
          :class="errors.label ? 'border-danger-300' : 'border-surface-300 dark:border-surface-700'"
        />
        <p v-if="errors.label" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.label }}</p>
      </div>

      <!-- Info block: rich content -->
      <div v-if="isInfo">
        <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Content <span class="text-danger-500">*</span>
        </label>
        <RichTextEditor v-model="form.content" />
        <p v-if="errors.content" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.content }}</p>
        <p v-else class="mt-1 text-xs text-surface-400 dark:text-surface-500">Shown to applicants as information — no answer is collected.</p>
      </div>

      <!-- Description / help text -->
      <div v-if="!isInfo">
        <label for="q-desc" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Help Text <span class="text-surface-400 font-normal">(optional)</span>
        </label>
        <input
          id="q-desc"
          v-model="form.description"
          type="text"
          maxlength="1000"
          placeholder="Additional context shown below the field"
          class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
        />
        <p v-if="errors.description" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.description }}</p>
      </div>

      <!-- Rating scale settings -->
      <div v-if="isRating" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-800/50 p-3 space-y-3">
        <div>
          <label for="q-rating-max" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Scale
          </label>
          <select
            id="q-rating-max"
            v-model.number="form.ratingMax"
            class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-white dark:bg-surface-800"
          >
            <option v-for="n in ratingScaleChoices" :key="n" :value="n">1 to {{ n }}</option>
          </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="q-rating-min-label" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Label for 1 <span class="text-surface-400 font-normal">(optional)</span>
            </label>
            <input
              id="q-rating-min-label"
              v-model="form.ratingMinLabel"
              type="text"
              maxlength="100"
              placeholder="e.g. Not experienced"
              class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
            />
          </div>
          <div>
            <label for="q-rating-max-label" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Label for {{ form.ratingMax }} <span class="text-surface-400 font-normal">(optional)</span>
            </label>
            <input
              id="q-rating-max-label"
              v-model="form.ratingMaxLabel"
              type="text"
              maxlength="100"
              placeholder="e.g. Very experienced"
              class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
            />
          </div>
        </div>
        <p class="text-xs text-surface-400 dark:text-surface-500">
          Applicants pick one rating per item:
          <span class="text-surface-500 dark:text-surface-400">
            {{ ratingColumns.map(n => n === 1 && form.ratingMinLabel.trim() ? `1 – ${form.ratingMinLabel.trim()}` : n === form.ratingMax && form.ratingMaxLabel.trim() ? `${n} – ${form.ratingMaxLabel.trim()}` : n).join(' · ') }}
          </span>
        </p>
      </div>

      <!-- Options (select types) / items to rate (rating grid) -->
      <div v-if="hasOptionList && !isInfo">
        <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          {{ isRating ? 'Items to rate' : 'Options' }} <span class="text-danger-500">*</span>
        </label>
        <p v-if="isRating" class="mb-2 text-xs text-surface-400 dark:text-surface-500">
          One row per item — e.g. each piece of equipment or software.
        </p>
        <div class="space-y-2">
          <div v-for="(_, index) in form.options" :key="index" class="flex items-center gap-2">
            <input
              v-model="form.options[index]"
              type="text"
              maxlength="200"
              :placeholder="isRating ? `Item ${index + 1}` : `Option ${index + 1}`"
              class="flex-1 rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
            />
            <button
              type="button"
              class="rounded p-1 text-surface-400 hover:text-danger-600 transition-colors disabled:opacity-30"
              :disabled="form.options.length <= 1"
              @click="removeOption(index)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          :disabled="form.options.length >= 50"
          class="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 transition-colors"
          @click="addOption"
        >
          <Plus class="size-3.5" />
          {{ isRating ? 'Add item' : 'Add option' }}
        </button>
        <p v-if="errors.options" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.options }}</p>
      </div>

      <!-- Branching: only show this item for certain earlier answers -->
      <div v-if="conditionSources.length" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-800/50 p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.conditionEnabled"
            type="checkbox"
            class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
          />
          <span class="text-sm font-medium text-surface-700 dark:text-surface-300">
            Only show this {{ isInfo ? 'block' : 'question' }} for certain answers
          </span>
        </label>

        <div v-if="form.conditionEnabled" class="mt-3 space-y-3">
          <div>
            <label for="q-condition-source" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Depends on
            </label>
            <select
              id="q-condition-source"
              v-model="form.conditionQuestionId"
              class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-white dark:bg-surface-800"
            >
              <option value="" disabled>Choose an earlier question…</option>
              <option v-for="source in conditionSources" :key="source.id" :value="source.id">
                {{ source.label }}
              </option>
            </select>
          </div>

          <div v-if="conditionChoices.length">
            <p class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Show when the answer is
            </p>
            <div class="space-y-1.5">
              <label
                v-for="choice in conditionChoices"
                :key="choice.value"
                class="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="form.conditionValues.includes(choice.value)"
                  class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
                  @change="toggleConditionValue(choice.value)"
                />
                <span class="text-sm text-surface-700 dark:text-surface-300">{{ choice.label }}</span>
              </label>
            </div>
          </div>

          <p v-if="errors.condition" class="text-xs text-danger-600 dark:text-danger-400">{{ errors.condition }}</p>
          <p v-else class="text-xs text-surface-400 dark:text-surface-500">
            Applicants who answer differently never see it, and it's left out of their application.
          </p>
        </div>
      </div>

      <!-- Required -->
      <label v-if="!isInfo" class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="form.required"
          type="checkbox"
          class="size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500"
        />
        <span class="text-sm text-surface-700 dark:text-surface-300">Required</span>
      </label>

      <!-- Actions -->
      <div class="flex items-center gap-2 pt-1">
        <button
          type="submit"
          class="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {{ isEditing ? 'Update' : (isInfo ? 'Add Block' : 'Add Question') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>
