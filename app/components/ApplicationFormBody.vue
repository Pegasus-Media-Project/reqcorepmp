<script setup lang="ts">
/**
 * Presentational application form — the single source of truth for how the
 * candidate-facing application renders. Used in two modes:
 *
 *  - `live`    : the real, interactive form on /jobs/[slug]/apply. When the job
 *                defines sections, this renders as a multi-step wizard (one
 *                section per page) with Back/Continue navigation.
 *  - `preview` : a non-interactive replica shown inside the recruiter's
 *                application builder. Fields are inert; clicking a field group
 *                emits `edit-field` so the builder can open the matching editor.
 *                Preview always renders the whole form on one page.
 *
 * Keeping both modes in one component is deliberate: the recruiter preview can
 * never drift from what candidates actually see, because there is only one
 * layout. State, validation and submission live in the parent — this component
 * is purely presentation plus two-way value binding.
 */
type Question = {
  id: string
  type: string
  label: string
  description?: string | null
  content?: string | null
  required: boolean
  options?: string[] | null
  sectionId?: string | null
}

type Section = {
  id: string
  title: string
  description?: string | null
  displayOrder: number
}

const props = withDefaults(defineProps<{
  job: {
    phoneRequirement?: 'hidden' | 'optional' | 'required'
    requireResume?: boolean
    requireCoverLetter?: boolean
    questions?: Question[]
  }
  sections?: Section[]
  mode?: 'live' | 'preview'
  errors?: Record<string, string>
  submitError?: string | null
  isSubmitting?: boolean
}>(), {
  sections: () => [],
  mode: 'live',
  errors: () => ({}),
  submitError: null,
  isSubmitting: false,
})

const emit = defineEmits<{
  (e: 'file-selected', questionId: string, file: File | null): void
  (e: 'clear-error', key: string): void
  (e: 'submit'): void
  /** Preview mode: the recruiter clicked a field group to edit it. */
  (e: 'edit-field', field: string): void
}>()

const form = defineModel<{
  firstName: string
  lastName: string
  email: string
  phone: string
  website: string
}>('form', { required: true })
const responses = defineModel<Record<string, string | string[] | number | boolean>>('responses', { required: true })
const resume = defineModel<File | null>('resume', { default: null })
const coverLetter = defineModel<string>('coverLetter', { default: '' })

const { t } = useI18n()

const isPreview = computed(() => props.mode === 'preview')

/** In preview mode, clicking a field group edits it instead of focusing the input. */
function onFieldClick(field: string) {
  if (isPreview.value) emit('edit-field', field)
}

// ─────────────────────────────────────────────
// Sections / wizard steps
// ─────────────────────────────────────────────

const sortedSections = computed(() =>
  [...(props.sections ?? [])].sort((a, b) => a.displayOrder - b.displayOrder))

const allQuestions = computed(() => props.job.questions ?? [])
const sectionIds = computed(() => new Set(sortedSections.value.map(s => s.id)))

/** Questions not tied to a (still-existing) section — the implicit default page. */
const unsectionedQuestions = computed(() =>
  allQuestions.value.filter(q => !q.sectionId || !sectionIds.value.has(q.sectionId)))

function questionsForSection(sectionId: string) {
  return allQuestions.value.filter(q => q.sectionId === sectionId)
}

const hasDocuments = computed(() => !!props.job.requireResume || !!props.job.requireCoverLetter)

/** Wizard is only active on the live form when the job defines sections. */
const isWizard = computed(() => props.mode === 'live' && sortedSections.value.length > 0)

type Step =
  | { key: 'personal' }
  | { key: 'section', section: Section }
  | { key: 'default' }
  | { key: 'documents' }

const steps = computed<Step[]>(() => {
  const arr: Step[] = [{ key: 'personal' }]
  for (const s of sortedSections.value) arr.push({ key: 'section', section: s })
  if (unsectionedQuestions.value.length) arr.push({ key: 'default' })
  if (hasDocuments.value) arr.push({ key: 'documents' })
  return arr
})

const currentStep = ref(0)
watch(steps, (s) => { if (currentStep.value > s.length - 1) currentStep.value = Math.max(0, s.length - 1) })

const activeStep = computed<Step | undefined>(() => steps.value[currentStep.value])
const isLastStep = computed(() => currentStep.value >= steps.value.length - 1)

// What each section of the form should render right now.
const showPersonal = computed(() => !isWizard.value || activeStep.value?.key === 'personal')
const showDocuments = computed(() => hasDocuments.value && (!isWizard.value || activeStep.value?.key === 'documents'))

/** Questions visible on the current view. Non-wizard shows all; wizard shows the step's. */
const visibleQuestions = computed<Question[]>(() => {
  if (!isWizard.value) return allQuestions.value
  const step = activeStep.value
  if (step?.key === 'section') return questionsForSection(step.section.id)
  if (step?.key === 'default') return unsectionedQuestions.value
  return []
})

/** In non-wizard mode with sections, we still group questions under headings. */
const nonWizardGroups = computed(() => {
  const groups: { title: string | null, description: string | null, questions: Question[] }[] = []
  for (const s of sortedSections.value) {
    const qs = questionsForSection(s.id)
    if (qs.length) groups.push({ title: s.title, description: s.description ?? null, questions: qs })
  }
  if (unsectionedQuestions.value.length) {
    groups.push({ title: null, description: null, questions: unsectionedQuestions.value })
  }
  return groups
})

const currentSectionMeta = computed(() => {
  const step = activeStep.value
  return step?.key === 'section' ? step.section : null
})

// ─────────────────────────────────────────────
// Per-step validation (wizard) + error → step mapping
// ─────────────────────────────────────────────

const stepErrors = ref<Record<string, string>>({})
const displayErrors = computed<Record<string, string>>(() => ({ ...props.errors, ...stepErrors.value }))

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** Validate only the fields on the current step before advancing. */
function validateCurrentStep(): boolean {
  const errs: Record<string, string> = {}
  const step = activeStep.value
  if (step?.key === 'personal') {
    if (!form.value.firstName.trim()) errs.firstName = t('jobs.apply.validation.firstNameRequired')
    if (!form.value.lastName.trim()) errs.lastName = t('jobs.apply.validation.lastNameRequired')
    if (!form.value.email.trim()) errs.email = t('jobs.apply.validation.emailRequired')
    if (props.job.phoneRequirement === 'required' && !form.value.phone.trim()) {
      errs.phone = t('jobs.apply.validation.phoneRequired')
    }
  }
  else if (step?.key === 'section' || step?.key === 'default') {
    for (const q of visibleQuestions.value) {
      if (q.required && q.type !== 'file_upload' && isEmpty(responses.value[q.id])) {
        errs[`q-${q.id}`] = t('jobs.apply.validation.fieldRequired')
      }
    }
  }
  else if (step?.key === 'documents') {
    if (props.job.requireResume && !resume.value) errs.resume = t('jobs.apply.validation.resumeRequired')
    if (props.job.requireCoverLetter && !coverLetter.value.trim()) errs.coverLetter = t('jobs.apply.validation.coverLetterRequired')
  }
  stepErrors.value = errs
  return Object.keys(errs).length === 0
}

function goNext() {
  if (!validateCurrentStep()) return
  if (currentStep.value < steps.value.length - 1) currentStep.value++
}

function goBack() {
  stepErrors.value = {}
  if (currentStep.value > 0) currentStep.value--
}

function onSubmit() {
  // Final step: run the step's own required check, then hand off to the parent
  // which performs full validation (email format, sizes, all questions).
  if (isWizard.value && !validateCurrentStep()) return
  emit('submit')
}

/** Which step index owns a given error key (for jumping after a failed submit). */
function stepIndexForErrorKey(key: string): number {
  if (['firstName', 'lastName', 'email', 'phone'].includes(key)) {
    return steps.value.findIndex(s => s.key === 'personal')
  }
  if (key === 'resume' || key === 'coverLetter') {
    return steps.value.findIndex(s => s.key === 'documents')
  }
  if (key.startsWith('q-')) {
    const qid = key.slice(2)
    const q = allQuestions.value.find(x => x.id === qid)
    if (q?.sectionId && sectionIds.value.has(q.sectionId)) {
      return steps.value.findIndex(s => s.key === 'section' && s.section.id === q.sectionId)
    }
    return steps.value.findIndex(s => s.key === 'default')
  }
  return -1
}

// After the parent runs full validation (or the server rejects), jump the
// wizard to the earliest step that has an error so it's visible.
watch(() => props.errors, (errs) => {
  if (!isWizard.value) return
  const keys = Object.keys(errs ?? {})
  if (!keys.length) return
  const indices = keys.map(stepIndexForErrorKey).filter(i => i >= 0)
  if (indices.length) {
    const target = Math.min(...indices)
    if (target !== currentStep.value) currentStep.value = target
  }
}, { deep: true })

function clearError(key: string) {
  if (stepErrors.value[key]) {
    const next = { ...stepErrors.value }
    delete next[key]
    stepErrors.value = next
  }
  emit('clear-error', key)
}
</script>

<template>
  <!-- Application form card -->
  <div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm overflow-hidden">
    <!-- Card header -->
    <div class="border-b border-surface-100 dark:border-surface-800 px-6 sm:px-8 py-5">
      <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('jobs.form.cardTitle') }}</h2>
      <i18n-t keypath="jobs.form.requiredHint" tag="p" class="mt-0.5 text-sm text-surface-500">
        <template #mark><span class="text-danger-500">*</span></template>
      </i18n-t>

      <!-- Wizard progress -->
      <div v-if="isWizard" class="mt-4">
        <div class="flex items-center justify-between mb-1.5">
          <p class="text-xs font-medium text-surface-600 dark:text-surface-300">
            {{ t('jobs.form.wizard.stepOf', { current: currentStep + 1, total: steps.length }) }}
          </p>
        </div>
        <div class="h-1.5 w-full rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
          <div
            class="h-full rounded-full bg-brand-600 transition-all duration-300"
            :style="{ width: `${((currentStep + 1) / steps.length) * 100}%` }"
          />
        </div>
      </div>
    </div>

    <div class="px-6 sm:px-8 py-6 sm:py-8">
      <!-- Server error banner -->
      <div
        v-if="submitError"
        class="rounded-xl border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/50 px-4 py-3 text-sm text-danger-700 dark:text-danger-400 mb-6 flex items-start gap-3"
        role="alert"
      >
        <svg class="mt-0.5 size-4 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ submitError }}</span>
      </div>

      <form
        class="space-y-5"
        :class="isPreview ? 'select-none' : ''"
        @submit.prevent="onSubmit"
      >
        <!-- Honeypot (hidden from humans) -->
        <div class="absolute -left-[9999px]" aria-hidden="true">
          <label for="website">Website</label>
          <input id="website" v-model="form.website" type="text" tabindex="-1" autocomplete="off" />
        </div>

        <!-- ── Personal info ── -->
        <template v-if="showPersonal">
          <!-- Name row -->
          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-4"
            :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
            @click="onFieldClick('name')"
          >
            <!-- First Name -->
            <div>
              <label for="firstName" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                {{ t('jobs.form.firstName') }} <span class="text-danger-500">*</span>
              </label>
              <input
                id="firstName"
                v-model="form.firstName"
                type="text"
                :placeholder="t('jobs.form.firstNamePlaceholder')"
                autocomplete="given-name"
                :tabindex="isPreview ? -1 : undefined"
                @input="clearError('firstName')"
                :class="[
                  'w-full rounded-xl border px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors',
                  displayErrors.firstName ? 'border-danger-300 dark:border-danger-700 focus:ring-danger-500 focus:border-danger-500' : 'border-surface-300 dark:border-surface-700',
                  isPreview ? 'pointer-events-none' : '',
                ]"
              />
              <p v-if="displayErrors.firstName" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
                <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ displayErrors.firstName }}
              </p>
            </div>

            <!-- Last Name -->
            <div>
              <label for="lastName" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                {{ t('jobs.form.lastName') }} <span class="text-danger-500">*</span>
              </label>
              <input
                id="lastName"
                v-model="form.lastName"
                type="text"
                :placeholder="t('jobs.form.lastNamePlaceholder')"
                autocomplete="family-name"
                :tabindex="isPreview ? -1 : undefined"
                @input="clearError('lastName')"
                :class="[
                  'w-full rounded-xl border px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors',
                  displayErrors.lastName ? 'border-danger-300 dark:border-danger-700 focus:ring-danger-500 focus:border-danger-500' : 'border-surface-300 dark:border-surface-700',
                  isPreview ? 'pointer-events-none' : '',
                ]"
              />
              <p v-if="displayErrors.lastName" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
                <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ displayErrors.lastName }}
              </p>
            </div>
          </div>

          <!-- Email -->
          <div
            :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
            @click="onFieldClick('email')"
          >
            <label for="email" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              {{ t('jobs.form.email') }} <span class="text-danger-500">*</span>
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              :placeholder="t('jobs.form.emailPlaceholder')"
              autocomplete="email"
              :tabindex="isPreview ? -1 : undefined"
              @input="clearError('email')"
              :class="[
                'w-full rounded-xl border px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors',
                displayErrors.email ? 'border-danger-300 dark:border-danger-700 focus:ring-danger-500 focus:border-danger-500' : 'border-surface-300 dark:border-surface-700',
                isPreview ? 'pointer-events-none' : '',
              ]"
            />
            <p v-if="displayErrors.email" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
              <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ displayErrors.email }}
            </p>
          </div>

          <!-- Phone -->
          <div
            v-if="job.phoneRequirement !== 'hidden'"
            :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
            @click="onFieldClick('phone')"
          >
            <label for="phone" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              {{ t('jobs.form.phone') }}
              <span v-if="job.phoneRequirement === 'required'" class="text-danger-500">*</span>
              <span v-else class="text-surface-400 font-normal text-xs">{{ t('jobs.form.optional') }}</span>
            </label>
            <input
              id="phone"
              v-model="form.phone"
              type="tel"
              :placeholder="t('jobs.form.phonePlaceholder')"
              autocomplete="tel"
              :tabindex="isPreview ? -1 : undefined"
              @input="clearError('phone')"
              :class="[
                'w-full rounded-xl border px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors',
                displayErrors.phone ? 'border-danger-300 dark:border-danger-700 focus:ring-danger-500 focus:border-danger-500' : 'border-surface-300 dark:border-surface-700',
                isPreview ? 'pointer-events-none' : '',
              ]"
            />
            <p v-if="displayErrors.phone" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
              <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ displayErrors.phone }}
            </p>
          </div>
        </template>

        <!-- ── Custom questions ── -->
        <!-- Wizard: current section's questions with its heading -->
        <template v-if="isWizard && visibleQuestions.length > 0">
          <div class="space-y-5">
            <div v-if="currentSectionMeta">
              <p class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ currentSectionMeta.title }}</p>
              <p v-if="currentSectionMeta.description" class="mt-0.5 text-sm text-surface-500 dark:text-surface-400">{{ currentSectionMeta.description }}</p>
            </div>
            <p v-else class="text-sm font-medium text-surface-700 dark:text-surface-300">{{ t('jobs.form.additionalQuestions') }}</p>
            <div class="space-y-5">
              <div v-for="q in visibleQuestions" :key="q.id">
                <FormInfoBlock v-if="q.type === 'info'" :block="q" />
                <DynamicField
                  v-else
                  v-model="responses[q.id]"
                  :question="q"
                  :error="displayErrors[`q-${q.id}`]"
                  @file-selected="(id: string, file: File | null) => emit('file-selected', id, file)"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Non-wizard: all questions, grouped by section heading when present -->
        <template v-else-if="!isWizard && allQuestions.length > 0">
          <div class="border-t border-surface-100 dark:border-surface-800 pt-5 space-y-6">
            <div v-for="(group, gi) in nonWizardGroups" :key="gi">
              <p v-if="group.title" class="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-1">{{ group.title }}</p>
              <p v-else class="text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">{{ t('jobs.form.additionalQuestions') }}</p>
              <p v-if="group.description" class="text-xs text-surface-500 dark:text-surface-400 mb-3">{{ group.description }}</p>
              <div class="space-y-5 mt-3">
                <div
                  v-for="q in group.questions"
                  :key="q.id"
                  :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
                  @click="onFieldClick(`question:${q.id}`)"
                >
                  <div :class="isPreview ? 'pointer-events-none' : ''">
                    <FormInfoBlock v-if="q.type === 'info'" :block="q" />
                    <DynamicField
                      v-else
                      v-model="responses[q.id]"
                      :question="q"
                      :error="displayErrors[`q-${q.id}`]"
                      @file-selected="(id: string, file: File | null) => emit('file-selected', id, file)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Resume / Cover Letter uploads ── -->
        <template v-if="showDocuments">
          <div class="border-t border-surface-100 dark:border-surface-800 pt-5 space-y-5">
            <!-- Resume -->
            <div
              v-if="job.requireResume"
              :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
              @click="onFieldClick('resume')"
            >
              <label for="resume" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                {{ t('jobs.form.resume') }} <span class="text-danger-500">*</span>
              </label>
              <div
                class="relative flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors"
                :class="displayErrors.resume
                  ? 'border-danger-300 dark:border-danger-700 bg-danger-50/50 dark:bg-danger-950/20'
                  : 'border-surface-300 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50'
                "
              >
                <svg class="size-5 shrink-0 text-surface-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div class="flex-1 min-w-0">
                  <p v-if="resume" class="text-sm text-surface-900 dark:text-surface-100 truncate">{{ resume.name }}</p>
                  <p v-else class="text-sm text-surface-500">{{ t('jobs.form.resumeHelp') }}</p>
                </div>
                <label
                  for="resume"
                  class="shrink-0 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 px-3 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-600 transition-colors"
                  :class="isPreview ? 'pointer-events-none' : 'cursor-pointer'"
                >
                  {{ resume ? t('jobs.form.change') : t('jobs.form.chooseFile') }}
                </label>
                <input
                  id="resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  class="sr-only"
                  :disabled="isPreview"
                  @change="(e: Event) => { const el = e.target as HTMLInputElement; resume = el.files?.[0] ?? null; clearError('resume') }"
                />
              </div>
              <p v-if="displayErrors.resume" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
                <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ displayErrors.resume }}
              </p>
            </div>

            <!-- Cover Letter -->
            <div
              v-if="job.requireCoverLetter"
              :class="isPreview ? 'cursor-pointer rounded-xl ring-offset-2 ring-offset-white dark:ring-offset-surface-900 hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-shadow' : ''"
              @click="onFieldClick('coverLetter')"
            >
              <label for="coverLetterText" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                {{ t('jobs.form.coverLetter') }} <span class="text-danger-500">*</span>
              </label>
              <textarea
                id="coverLetterText"
                v-model="coverLetter"
                rows="6"
                maxlength="10000"
                :placeholder="t('jobs.form.coverLetterPlaceholder')"
                :tabindex="isPreview ? -1 : undefined"
                :class="[
                  'w-full rounded-xl border px-4 py-3 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors',
                  displayErrors.coverLetter ? 'border-danger-300 dark:border-danger-700' : 'border-surface-300 dark:border-surface-700',
                  isPreview ? 'pointer-events-none' : '',
                ]"
                @input="clearError('coverLetter')"
              />
              <p v-if="displayErrors.coverLetter" class="mt-1.5 flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
                <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ displayErrors.coverLetter }}
              </p>
              <p v-else class="mt-1.5 text-xs text-surface-500">{{ t('jobs.form.coverLetterMax') }}</p>
            </div>
          </div>
        </template>

        <!-- ── Wizard navigation ── -->
        <div v-if="isWizard" class="border-t border-surface-100 dark:border-surface-800 pt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            :disabled="currentStep === 0 || isSubmitting"
            class="inline-flex items-center gap-1.5 rounded-xl border border-surface-300 dark:border-surface-700 px-5 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            @click="goBack"
          >
            {{ t('jobs.form.wizard.back') }}
          </button>

          <button
            v-if="!isLastStep"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-[0.98] transition-all"
            @click="goNext"
          >
            {{ t('jobs.form.wizard.next') }}
          </button>
          <button
            v-else
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg v-if="isSubmitting" class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ isSubmitting ? t('jobs.form.submitting') : t('jobs.form.submit') }}
          </button>
        </div>

        <!-- ── Single-page submit row (non-wizard) ── -->
        <div v-else class="border-t border-surface-100 dark:border-surface-800 pt-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="submit"
            :disabled="isSubmitting || isPreview"
            :tabindex="isPreview ? -1 : undefined"
            class="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            :class="isPreview ? 'pointer-events-none' : ''"
          >
            <svg v-if="isSubmitting" class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ isSubmitting ? t('jobs.form.submitting') : t('jobs.form.submit') }}
          </button>
          <p class="text-xs text-surface-400">{{ t('jobs.form.confidential') }}</p>
        </div>
      </form>
    </div>
  </div>
</template>
