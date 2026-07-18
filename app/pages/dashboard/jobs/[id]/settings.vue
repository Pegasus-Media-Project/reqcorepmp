<script setup lang="ts">
import {
  Save, Trash2, ArrowLeft, ExternalLink, Link2, ClipboardCopy,
} from 'lucide-vue-next'
import { z } from 'zod'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const toast = useToast()
const { t } = useI18n()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { track } = useTrack()

const { job, status: fetchStatus, error: fetchError, updateJob, deleteJob } = useJob(jobId)
const { programs } = usePrograms()
const { employmentTypes } = useEmploymentTypes()
// Assigning users to a job is an admin/owner action (program:update).
const { allowed: canManageAccess } = usePermission({ program: ['update'] })

useSeoMeta({
  title: computed(() =>
    job.value ? `Settings — ${job.value.title} — Pegasus Media Project` : 'Job Settings — Pegasus Media Project',
  ),
})

// ─────────────────────────────────────────────
// Form state — synced from fetched job
// ─────────────────────────────────────────────

const form = ref({
  title: '',
  programId: '' as string,
  description: '',
  location: '',
  type: 'Full-time' as string,
  slug: '',
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  salaryCurrency: '',
  salaryUnit: '' as string,
  salaryNegotiable: false,
  remoteStatus: '' as string,
  experienceLevel: '' as string,
  validThrough: '',
  requireResume: false,
  requireCoverLetter: false,
  autoScoreOnApply: false,
  hideApplicationQuestions: false,
  applicationQuestionsPdfUrl: '',
  applicationFeeEnabled: false,
  applicationFeeUrl: '',
  applicationFeeAmount: null as number | null,
  applicationFeeCurrency: 'USD',
  requireSignedDocuments: false,
  signingUrl: '',
})

/**
 * Format a stored timestamp as a `YYYY-MM-DDTHH:mm` string in the viewer's
 * local time zone, which is the value format a `datetime-local` input expects.
 */
function toLocalDatetimeInput(value: string | Date): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

watch(job, (j) => {
  if (j) {
    form.value = {
      title: j.title ?? '',
      programId: (j as { programId?: string | null }).programId ?? '',
      description: j.description ?? '',
      location: j.location ?? '',
      type: j.type ?? 'Full-time',
      slug: j.slug ?? '',
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      salaryCurrency: j.salaryCurrency ?? '',
      salaryUnit: j.salaryUnit ?? '',
      salaryNegotiable: j.salaryNegotiable ?? false,
      remoteStatus: j.remoteStatus ?? '',
      experienceLevel: j.experienceLevel ?? '',
      validThrough: j.validThrough ? toLocalDatetimeInput(j.validThrough) : '',
      requireResume: j.requireResume ?? false,
      requireCoverLetter: j.requireCoverLetter ?? false,
      autoScoreOnApply: j.autoScoreOnApply ?? false,
      hideApplicationQuestions: (j as { hideApplicationQuestions?: boolean }).hideApplicationQuestions ?? false,
      applicationQuestionsPdfUrl: (j as { applicationQuestionsPdfUrl?: string | null }).applicationQuestionsPdfUrl ?? '',
      applicationFeeEnabled: (j as { applicationFeeEnabled?: boolean }).applicationFeeEnabled ?? false,
      applicationFeeUrl: (j as { applicationFeeUrl?: string | null }).applicationFeeUrl ?? '',
      // DB stores minor units (cents); the input edits a decimal amount.
      applicationFeeAmount: (() => {
        const cents = (j as { applicationFeeAmount?: number | null }).applicationFeeAmount
        return cents == null ? null : cents / 100
      })(),
      applicationFeeCurrency: (j as { applicationFeeCurrency?: string | null }).applicationFeeCurrency ?? 'USD',
      requireSignedDocuments: (j as { requireSignedDocuments?: boolean }).requireSignedDocuments ?? false,
      signingUrl: (j as { signingUrl?: string | null }).signingUrl ?? '',
    }
  }
}, { immediate: true })

// When "Negotiable" is toggled on, clear the salary range fields
watch(() => form.value.salaryNegotiable, (negotiable) => {
  if (negotiable) {
    form.value.salaryMin = null
    form.value.salaryMax = null
    form.value.salaryCurrency = ''
    form.value.salaryUnit = ''
  }
})

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

const editSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  programId: z.string().optional().or(z.literal('')),
  description: z.string().optional(),
  location: z.string().optional(),
  type: z.string().min(1, 'Employment type is required').max(60),
  slug: z.string().max(80).optional(),
  salaryMin: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryMax: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryCurrency: z.string().length(3).optional().or(z.literal('')),
  salaryUnit: z.enum(['YEAR', 'MONTH', 'HOUR']).optional().or(z.literal('')),
  salaryNegotiable: z.boolean().optional(),
  remoteStatus: z.enum(['remote', 'hybrid', 'onsite']).optional().or(z.literal('')),
  experienceLevel: z.enum(['junior', 'mid', 'senior', 'lead']).optional().or(z.literal('')),
  validThrough: z.string().optional(),
  requireResume: z.boolean().optional(),
  requireCoverLetter: z.boolean().optional(),
  autoScoreOnApply: z.boolean().optional(),
  hideApplicationQuestions: z.boolean().optional(),
  applicationQuestionsPdfUrl: z.string().url('Enter a valid PDF URL').optional().or(z.literal('')),
  applicationFeeEnabled: z.boolean().optional(),
  applicationFeeUrl: z.string().url('Enter a valid payment URL').optional().or(z.literal('')),
  applicationFeeAmount: z.union([z.coerce.number().min(0), z.null()]).optional(),
  applicationFeeCurrency: z.string().length(3).optional().or(z.literal('')),
  requireSignedDocuments: z.boolean().optional(),
  signingUrl: z.string().url('Enter a valid signing URL').optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.applicationFeeEnabled && !data.applicationFeeUrl) {
    ctx.addIssue({ code: 'custom', message: 'A payment link is required when the fee is enabled', path: ['applicationFeeUrl'] })
  }
  if (data.requireSignedDocuments && !data.signingUrl) {
    ctx.addIssue({ code: 'custom', message: 'A signing link is required when documents are required', path: ['signingUrl'] })
  }
})

const errors = ref<Record<string, string>>({})
const isSaving = ref(false)
const saved = ref(false)

async function handleSave() {
  const result = editSchema.safeParse(form.value)
  if (!result.success) {
    errors.value = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString()
      if (field) errors.value[field] = issue.message
    }
    return
  }
  errors.value = {}
  isSaving.value = true

  try {
    const payload: Record<string, unknown> = {
      title: form.value.title,
      programId: form.value.programId || null,
      description: form.value.description || null,
      location: form.value.location || null,
      type: form.value.type,
      slug: form.value.slug || undefined,
      requireResume: form.value.requireResume,
      requireCoverLetter: form.value.requireCoverLetter,
      autoScoreOnApply: form.value.autoScoreOnApply,
      hideApplicationQuestions: form.value.hideApplicationQuestions,
      applicationQuestionsPdfUrl: form.value.applicationQuestionsPdfUrl || null,
      // Application fee — send the decimal amount as minor units (cents).
      applicationFeeEnabled: form.value.applicationFeeEnabled,
      applicationFeeUrl: form.value.applicationFeeUrl || null,
      applicationFeeAmount: form.value.applicationFeeAmount == null
        ? null
        : Math.round(form.value.applicationFeeAmount * 100),
      applicationFeeCurrency: form.value.applicationFeeCurrency || null,
      requireSignedDocuments: form.value.requireSignedDocuments,
      signingUrl: form.value.signingUrl || null,
      salaryNegotiable: form.value.salaryNegotiable,
      // Always send salary fields so cleared values write null to the DB
      salaryMin: form.value.salaryNegotiable ? null : (form.value.salaryMin ?? null),
      salaryMax: form.value.salaryNegotiable ? null : (form.value.salaryMax ?? null),
      salaryCurrency: form.value.salaryNegotiable ? null : (form.value.salaryCurrency || null),
      salaryUnit: form.value.salaryNegotiable ? null : (form.value.salaryUnit || null),
      remoteStatus: form.value.remoteStatus || null,
      experienceLevel: (form.value.experienceLevel as 'junior' | 'mid' | 'senior' | 'lead' | null) || null,
      // Send null when cleared so the DB column is set to NULL
      validThrough: form.value.validThrough ? new Date(form.value.validThrough) : null,
    }

    await updateJob(payload as any)
    track('job_settings_saved', { job_id: jobId })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save changes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSaving.value = false
  }
}

// ─────────────────────────────────────────────
// Application link
// ─────────────────────────────────────────────

const requestUrl = useRequestURL()
const applicationUrl = computed(() => {
  const base = `${requestUrl.protocol}//${requestUrl.host}`
  return `${base}/jobs/${job.value?.slug ?? jobId}/apply`
})

const linkCopied = ref(false)

async function copyApplicationLink() {
  try {
    await navigator.clipboard.writeText(applicationUrl.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    toast.info(applicationUrl.value)
  }
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

const showDeleteConfirm = ref(false)
const isDeleting = ref(false)

async function handleDelete() {
  isDeleting.value = true
  try {
    track('job_deleted', { job_id: jobId, source: 'settings' })
    await deleteJob()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete job', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

// ─────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────

// Employment-type options come from the org-configurable list. A job stores the
// chosen label directly; if the job's current label was since removed from the
// list, keep it selectable so saving doesn't silently change it.
const typeOptions = computed(() => {
  const labels = employmentTypes.value.map(e => e.label)
  if (form.value.type && !labels.includes(form.value.type)) labels.unshift(form.value.type)
  return labels.map(label => ({ value: label, label }))
})

const remoteOptions = [
  { value: '', label: 'Not specified' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

const experienceLevelOptions = [
  { value: '', label: 'Not specified' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]

const salaryUnitOptions = [
  { value: '', label: 'Not specified' },
  { value: 'YEAR', label: 'Per year' },
  { value: 'MONTH', label: 'Per month' },
  { value: 'HOUR', label: 'Per hour' },
]

function onSalaryMinChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMin = null
}

function onSalaryMaxChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMax = null
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <JobSubNavActions :job-id="jobId" />

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
      Loading…
    </div>

    <!-- Error -->
    <div
      v-else-if="fetchError"
      class="rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950 p-4 text-sm text-danger-700 dark:text-danger-400"
    >
      {{ fetchError.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard/jobs')" class="underline ml-1">Back to Jobs</NuxtLink>
    </div>

    <template v-else-if="job">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Job Settings</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Edit the details for <strong>{{ job.title }}</strong>.
        </p>
      </div>

      <form @submit.prevent="handleSave" class="space-y-8">
        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Basic Details                   -->
        <!-- ═══════════════════════════════════════ -->
        <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-5">Basic Details</h2>
          <div class="space-y-4">
            <!-- Title -->
            <div>
              <label for="settings-title" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Title <span class="text-danger-500">*</span>
              </label>
              <input
                id="settings-title"
                v-model="form.title"
                type="text"
                class="w-full rounded-lg border px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                :class="errors.title ? 'border-danger-300' : 'border-surface-300 dark:border-surface-700'"
              />
              <p v-if="errors.title" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.title }}</p>
            </div>

            <!-- Description -->
            <div>
              <label for="settings-description" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Description
              </label>
              <textarea
                id="settings-description"
                v-model="form.description"
                rows="6"
                placeholder="Describe the role, responsibilities, and requirements…"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              />
            </div>

            <!-- Location + Type row -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="settings-location" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Location
                </label>
                <input
                  id="settings-location"
                  v-model="form.location"
                  type="text"
                  placeholder="e.g. Oslo, Norway"
                  class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label for="settings-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Employment Type
                </label>
                <select
                  id="settings-type"
                  v-model="form.type"
                  class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                >
                  <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Program -->
            <div>
              <label for="settings-program" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                {{ t('programs.jobField.label') }}
              </label>
              <select
                id="settings-program"
                v-model="form.programId"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              >
                <option value="">{{ t('programs.jobField.none') }}</option>
                <option v-for="p in programs" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">{{ t('programs.jobField.hint') }}</p>
            </div>

            <!-- Remote status -->
            <div>
              <label for="settings-remote" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Work Arrangement
              </label>
              <select
                id="settings-remote"
                v-model="form.remoteStatus"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              >
                <option v-for="opt in remoteOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- Experience Level -->
            <div>
              <label for="settings-experience-level" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Experience Level
              </label>
              <select
                id="settings-experience-level"
                v-model="form.experienceLevel"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              >
                <option v-for="opt in experienceLevelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- Slug -->
            <div>
              <label for="settings-slug" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                URL Slug
              </label>
              <input
                id="settings-slug"
                v-model="form.slug"
                type="text"
                placeholder="auto-generated-from-title"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors font-mono text-xs"
              />
              <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">
                Used in the public application URL. Leave blank to auto-generate from title.
              </p>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Salary & Compensation           -->
        <!-- ═══════════════════════════════════════ -->
        <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Salary & Compensation</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Adding salary information improves visibility on Google Jobs.
          </p>
          <div class="space-y-4">
            <!-- Negotiable toggle -->
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.salaryNegotiable"
                type="checkbox"
                class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Salary is negotiable</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">
                  When checked, "Negotiable" is shown instead of a specific salary range. Salary fields below will be cleared.
                </p>
              </div>
            </label>

            <!-- Salary range fields — hidden when negotiable -->
            <template v-if="!form.salaryNegotiable">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="settings-salary-min" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Minimum Salary
                  </label>
                  <input
                    id="settings-salary-min"
                    v-model.number="form.salaryMin"
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    @change="onSalaryMinChange"
                  />
                </div>
                <div>
                  <label for="settings-salary-max" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Maximum Salary
                  </label>
                  <input
                    id="settings-salary-max"
                    v-model.number="form.salaryMax"
                    type="number"
                    min="0"
                    placeholder="e.g. 80000"
                    class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    @change="onSalaryMaxChange"
                  />
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="settings-currency" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Currency
                  </label>
                  <input
                    id="settings-currency"
                    v-model="form.salaryCurrency"
                    type="text"
                    maxlength="3"
                    placeholder="e.g. USD, EUR, NOK"
                    class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors uppercase"
                  />
                </div>
                <div>
                  <label for="settings-salary-unit" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Pay Period
                  </label>
                  <select
                    id="settings-salary-unit"
                    v-model="form.salaryUnit"
                    class="w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                  >
                    <option v-for="opt in salaryUnitOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Application Options             -->
        <!-- ═══════════════════════════════════════ -->
        <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Application Options</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Control what candidates must provide when applying.
          </p>
          <div class="space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.requireResume"
                type="checkbox"
                class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Require resume/CV</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Candidates must upload a resume file.</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.requireCoverLetter"
                type="checkbox"
                class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Ask for cover letter</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Candidates can write a cover letter.</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.autoScoreOnApply"
                type="checkbox"
                class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Auto-score on apply</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Automatically run AI scoring when a candidate applies.</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.hideApplicationQuestions"
                type="checkbox"
                class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Hide questions on the listing</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Don't list the application questions on the public job page. Optionally link a PDF of all questions instead.</p>
              </div>
            </label>
            <div v-if="form.hideApplicationQuestions" class="ml-7">
              <label for="questions-pdf-url" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Questions PDF link (optional)</label>
              <input
                id="questions-pdf-url"
                v-model="form.applicationQuestionsPdfUrl"
                type="url"
                placeholder="https://… (link to a PDF of all questions)"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p v-if="errors.applicationQuestionsPdfUrl" class="mt-1 text-xs text-danger-600">{{ errors.applicationQuestionsPdfUrl }}</p>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Fees & Signed Documents         -->
        <!-- ═══════════════════════════════════════ -->
        <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Fees &amp; Signed Documents</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Steps your team confirms manually. Applicants see their status and action links on their confirmation-code page and by email.
          </p>

          <!-- Application fee (submission phase) -->
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              v-model="form.applicationFeeEnabled"
              type="checkbox"
              class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Require an application fee</span>
              <p class="text-xs text-surface-400 dark:text-surface-500">Applicants pay on an external site; staff manually verify payment before review.</p>
            </div>
          </label>
          <div v-if="form.applicationFeeEnabled" class="mt-3 ml-7 space-y-3">
            <div>
              <label for="fee-url" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Payment link</label>
              <input
                id="fee-url"
                v-model="form.applicationFeeUrl"
                type="url"
                placeholder="https://…"
                class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p v-if="errors.applicationFeeUrl" class="mt-1 text-xs text-danger-600">{{ errors.applicationFeeUrl }}</p>
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <label for="fee-amount" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Amount</label>
                <input
                  id="fee-amount"
                  v-model.number="form.applicationFeeAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="25.00"
                  class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div class="w-28">
                <label for="fee-currency" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Currency</label>
                <input
                  id="fee-currency"
                  v-model="form.applicationFeeCurrency"
                  type="text"
                  maxlength="3"
                  placeholder="USD"
                  class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm uppercase text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <!-- Signed documents (acceptance phase) -->
          <label class="flex items-center gap-3 cursor-pointer mt-5 pt-5 border-t border-surface-100 dark:border-surface-800">
            <input
              v-model="form.requireSignedDocuments"
              type="checkbox"
              class="size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Require signed documents on acceptance</span>
              <p class="text-xs text-surface-400 dark:text-surface-500">Once accepted, applicants sign binding documents at an external link; staff manually verify signing.</p>
            </div>
          </label>
          <div v-if="form.requireSignedDocuments" class="mt-3 ml-7">
            <label for="signing-url" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Signing link</label>
            <input
              id="signing-url"
              v-model="form.signingUrl"
              type="url"
              placeholder="https://… (e.g. DocuSign)"
              class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p v-if="errors.signingUrl" class="mt-1 text-xs text-danger-600">{{ errors.signingUrl }}</p>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Listing Expiry                  -->
        <!-- ═══════════════════════════════════════ -->
        <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Application Deadline</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Set the exact date and time when this posting stops accepting applications. Also used for Google Jobs rich results.
          </p>
          <div>
            <label for="settings-valid-through" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Closes at
            </label>
            <div class="flex items-center gap-2">
              <input
                id="settings-valid-through"
                v-model="form.validThrough"
                type="datetime-local"
                class="w-full sm:w-64 rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              />
              <button
                v-if="form.validThrough"
                type="button"
                class="text-xs text-surface-400 hover:text-danger-500 dark:hover:text-danger-400 transition-colors underline shrink-0"
                @click="form.validThrough = ''"
              >
                Clear
              </button>
            </div>
            <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">Uses your local time zone. Once this time passes, the public application form closes. Leave blank for no deadline.</p>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Application Link                -->
        <!-- ═══════════════════════════════════════ -->
        <section v-if="job.status === 'open'" class="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/30 p-6">
          <div class="flex items-center gap-2 mb-2">
            <Link2 class="size-4 text-brand-600 dark:text-brand-400" />
            <h2 class="text-base font-semibold text-brand-700 dark:text-brand-300">Application Link</h2>
          </div>
          <p class="text-xs text-surface-600 dark:text-surface-400 mb-3">
            Share this link with candidates so they can apply to this position.
          </p>
          <div class="flex items-center gap-2">
            <input
              type="text"
              readonly
              :value="applicationUrl"
              class="flex-1 rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-surface-900 px-3 py-1.5 text-sm text-surface-700 dark:text-surface-300 select-all"
            />
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              @click="copyApplicationLink"
            >
              <ClipboardCopy class="size-3.5" />
              {{ linkCopied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- Save button                              -->
        <!-- ═══════════════════════════════════════ -->
        <div class="flex items-center justify-between pt-2 pb-8">
          <button
            type="submit"
            :disabled="isSaving"
            class="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save class="size-4" />
            {{ saved ? 'Saved!' : isSaving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </form>

      <!-- ═══════════════════════════════════════ -->
      <!-- SECTION: Job Access (individual)         -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="canManageAccess" class="mb-12">
        <AssigneesPanel
          :list-url="`/api/jobs/${jobId}/access`"
          :title="t('programs.assignments.jobTitle')"
          :description="t('programs.assignments.jobDescription')"
          :can-manage="canManageAccess"
        />
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- SECTION: Guest reviewers                 -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="canManageAccess" class="mb-12">
        <GuestReviewersPanel :job-id="jobId" />
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- DANGER ZONE                              -->
      <!-- ═══════════════════════════════════════ -->
      <section class="rounded-xl border border-danger-200 dark:border-danger-800/60 bg-danger-50/50 dark:bg-danger-950/20 p-6 mb-12">
        <h2 class="text-base font-semibold text-danger-700 dark:text-danger-400 mb-1">Danger Zone</h2>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Permanently delete this job and all associated applications.
        </p>

        <div v-if="!showDeleteConfirm">
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-danger-300 dark:border-danger-700 px-4 py-2 text-sm font-medium text-danger-700 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-950/40 transition-colors"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="size-4" />
            Delete this Job
          </button>
        </div>

        <div v-else class="rounded-lg border border-danger-300 dark:border-danger-700 bg-white dark:bg-surface-900 p-4">
          <p class="text-sm text-surface-700 dark:text-surface-300 mb-3">
            Are you sure you want to delete <strong>{{ job.title }}</strong>? This will also delete all associated applications. This action cannot be undone.
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              :disabled="isDeleting"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white hover:bg-danger-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="handleDelete"
            >
              {{ isDeleting ? 'Deleting…' : 'Yes, Delete' }}
            </button>
            <button
              type="button"
              :disabled="isDeleting"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-surface-300 dark:border-surface-700 px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
