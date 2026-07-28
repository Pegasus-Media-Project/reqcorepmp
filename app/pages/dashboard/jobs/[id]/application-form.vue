<script setup lang="ts">
import { Link2, ClipboardCopy, Eye, RefreshCw, Trash2 } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const jobId = route.params.id as string
const toast = useToast()

const { job, status: fetchStatus, error, updateJob } = useJob(jobId)

useSeoMeta({
  title: computed(() =>
    job.value ? `Application Form — ${job.value.title} — Pegasus Media Project` : 'Application Form — Pegasus Media Project',
  ),
})

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
    // Fallback for non-HTTPS contexts
    toast.info(applicationUrl.value)
  }
}

// ─────────────────────────────────────────────
// Review link — a read-only share of this form, usable while the job is still
// a draft. Anyone with the link can page through the form but cannot submit.
// ─────────────────────────────────────────────

const { link: previewLink, createLink, revokeLink } = useJobPreviewLink(jobId)

const previewUrl = computed(() => {
  if (!previewLink.value) return ''
  return `${requestUrl.protocol}//${requestUrl.host}/jobs/preview/${previewLink.value.token}`
})

const previewBusy = ref(false)
const previewCopied = ref(false)

const previewExpiryLabel = computed(() => {
  if (!previewLink.value) return ''
  return new Date(previewLink.value.expiresAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
})

const previewViewsLabel = computed(() => {
  const count = previewLink.value?.viewCount ?? 0
  if (count === 0) return 'not opened yet'
  return `opened ${count} ${count === 1 ? 'time' : 'times'}`
})

async function runPreviewOp(op: () => Promise<unknown>, failure: string) {
  previewBusy.value = true
  try {
    await op()
  } catch {
    toast.error(failure)
  } finally {
    previewBusy.value = false
  }
}

const createPreviewLink = () => runPreviewOp(() => createLink(), 'Could not create the review link.')
const rotatePreviewLink = () => runPreviewOp(async () => {
  await createLink()
  toast.success('New review link created. The old one no longer works.')
}, 'Could not refresh the review link.')
const revokePreviewLink = () => runPreviewOp(async () => {
  await revokeLink()
  toast.success('Review link revoked.')
}, 'Could not revoke the review link.')

async function copyPreviewLink() {
  try {
    await navigator.clipboard.writeText(previewUrl.value)
    previewCopied.value = true
    setTimeout(() => { previewCopied.value = false }, 2000)
  } catch {
    toast.info(previewUrl.value)
  }
}

// ─────────────────────────────────────────────
// Live application builder — shared with the create-job wizard.
// Every edit persists immediately via the operations below.
// ─────────────────────────────────────────────

const {
  questions: jobQuestions,
  sections: jobSections,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
} = useJobQuestions(jobId)

type QuestionType =
  | 'short_text' | 'long_text' | 'single_select' | 'multi_select'
  | 'number' | 'date' | 'url' | 'checkbox' | 'file_upload' | 'info' | 'rating'

/** Type-specific settings; only rating grids use it today. */
type QuestionConfig = {
  ratingMax?: number
  ratingMinLabel?: string | null
  ratingMaxLabel?: string | null
}

type BuilderQuestion = {
  id: string
  label: string
  type: QuestionType
  description?: string | null
  content?: string | null
  required: boolean
  options?: string[] | null
  config?: QuestionConfig | null
  sectionId?: string | null
}

type BuilderSection = {
  id: string
  title: string
  description?: string | null
  displayOrder: number
}

const builderModel = ref<{
  phoneRequirement: 'hidden' | 'optional' | 'required'
  requireResume: boolean
  requireCoverLetter: boolean
  questions: BuilderQuestion[]
  sections: BuilderSection[]
}>({ phoneRequirement: 'optional', requireResume: false, requireCoverLetter: false, questions: [], sections: [] })

// Keep the builder model in sync with server state.
watch(job, (j) => {
  if (j) {
    builderModel.value.phoneRequirement = j.phoneRequirement ?? 'optional'
    builderModel.value.requireResume = j.requireResume ?? false
    builderModel.value.requireCoverLetter = j.requireCoverLetter ?? false
  }
}, { immediate: true })

watch(jobQuestions, (qs) => {
  builderModel.value.questions = (qs ?? []).map((q: any) => ({
    id: q.id,
    label: q.label,
    type: q.type as QuestionType,
    description: q.description ?? null,
    content: q.content ?? null,
    required: q.required,
    options: q.options ?? null,
    config: q.config ?? null,
    sectionId: q.sectionId ?? null,
  }))
}, { immediate: true })

watch(jobSections, (ss) => {
  builderModel.value.sections = (ss ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    displayOrder: s.displayOrder,
  }))
}, { immediate: true })

const builderOperations = {
  addQuestion: (data: any) => addQuestion({ ...data, displayOrder: jobQuestions.value?.length ?? 0 }),
  updateQuestion: (id: string, data: any) => updateQuestion(id, data),
  deleteQuestion: (id: string) => deleteQuestion(id),
  reorderQuestions: (order: { id: string; displayOrder: number }[]) => reorderQuestions(order),
  setPhoneRequirement: (value: 'hidden' | 'optional' | 'required') => updateJob({ phoneRequirement: value }),
  setRequireResume: (value: boolean) => updateJob({ requireResume: value }),
  setRequireCoverLetter: (value: boolean) => updateJob({ requireCoverLetter: value }),
  addSection: (data: { title: string, description?: string }) => addSection({ ...data, displayOrder: jobSections.value?.length ?? 0 }),
  updateSection: (id: string, data: { title?: string, description?: string | null }) => updateSection(id, data),
  deleteSection: (id: string) => deleteSection(id),
  reorderSections: (order: { id: string; displayOrder: number }[]) => reorderSections(order),
  assignQuestionSection: (id: string, sectionId: string | null) => updateQuestion(id, { sectionId }),
}

</script>

<template>
  <div class="mx-auto max-w-6xl">
    <JobSubNavActions :job-id="jobId" />

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
      Loading…
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950 p-4 text-sm text-danger-700 dark:text-danger-400"
    >
      {{ error.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard')" class="underline ml-1">Back to Jobs</NuxtLink>
    </div>

    <template v-else-if="job">
      <!-- Header -->

      <!-- Application builder: controls + live candidate preview -->
      <!--
        The two-column layout is intentionally driven by the scoped CSS below
        (a plain media query on `.builder-layout`) rather than a Tailwind
        arbitrary responsive utility. In production SSR the arbitrary
        `xl:grid-cols-[…]` utility was not reliably applied on the first paint
        after a hard refresh — the container rendered as `display:grid` but
        without its column template, so the form and preview stacked into a
        single column until a client-side navigation re-applied the styles.
        Owning the layout in scoped CSS (higher specificity, unlayered, always
        inlined with this component) makes the side-by-side layout deterministic
        across dev/prod and SSR/CSR.
      -->
      <div class="builder-layout mb-6">
        <div class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 min-w-0 overflow-hidden">
          <!-- Application link pinned to top of the form card -->
          <div v-if="job.status === 'open'" class="flex items-center gap-3 px-5 py-3 bg-brand-50 dark:bg-brand-950/50 border-b border-brand-100 dark:border-brand-900">
            <Link2 class="size-4 text-brand-500 dark:text-brand-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-brand-500 dark:text-brand-400 mb-0.5">Application link</p>
              <input
                type="text"
                readonly
                :value="applicationUrl"
                class="w-full bg-transparent text-xs text-brand-700 dark:text-brand-300 select-all outline-none font-mono"
              />
            </div>
            <button
              class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shrink-0"
              @click="copyApplicationLink"
            >
              <ClipboardCopy class="size-3.5" />
              {{ linkCopied ? 'Copied!' : 'Copy link' }}
            </button>
          </div>

          <!-- Review link: share the form before the job is published -->
          <div class="flex items-center gap-3 px-5 py-3 border-b border-surface-100 dark:border-surface-800">
            <Eye class="size-4 text-surface-400 dark:text-surface-500 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">
                Review link
              </p>
              <template v-if="previewLink">
                <input
                  type="text"
                  readonly
                  :value="previewUrl"
                  class="w-full bg-transparent text-xs text-surface-600 dark:text-surface-300 select-all outline-none font-mono"
                />
                <p class="mt-0.5 text-[11px] text-surface-400 dark:text-surface-500">
                  Read-only, no sign-in needed &middot; expires {{ previewExpiryLabel }} &middot; {{ previewViewsLabel }}
                </p>
              </template>
              <p v-else class="text-xs text-surface-500 dark:text-surface-400">
                Share this form with someone for feedback — works while the job is still a draft, and nothing they enter is submitted.
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <template v-if="previewLink">
                <button
                  :disabled="previewBusy"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-xs font-semibold text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-50"
                  @click="copyPreviewLink"
                >
                  <ClipboardCopy class="size-3.5" />
                  {{ previewCopied ? 'Copied!' : 'Copy link' }}
                </button>
                <button
                  :disabled="previewBusy"
                  title="Create a new link and stop the old one working"
                  class="rounded-lg p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-50"
                  @click="rotatePreviewLink"
                >
                  <RefreshCw class="size-3.5" />
                </button>
                <button
                  :disabled="previewBusy"
                  title="Revoke this link"
                  class="rounded-lg p-1.5 text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors disabled:opacity-50"
                  @click="revokePreviewLink"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </template>
              <button
                v-else
                :disabled="previewBusy"
                class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-xs font-semibold text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-50"
                @click="createPreviewLink"
              >
                <Link2 class="size-3.5" />
                Create review link
              </button>
            </div>
          </div>
          <div class="p-5">
            <ApplicationBuilder
              v-model="builderModel"
              :job-title="job.title"
              :operations="builderOperations"
              :show-preview="false"
            />
          </div>
        </div>
        <aside class="builder-preview min-w-0">
          <ApplicationBuilderPreview
            :application-form="builderModel"
            max-height="calc(100dvh - 10rem)"
            :job-details="{
              title: job.title,
              description: job.description ?? undefined,
              location: job.location ?? undefined,
              type: job.type ?? undefined,
              experienceLevel: job.experienceLevel ?? undefined,
              remoteStatus: job.remoteStatus ?? undefined,
            }"
          />
        </aside>
      </div>

    </template>
  </div>
</template>

<style scoped>
/*
  Deterministic side-by-side layout for the application builder.
  See the note in the template above: this replaces a Tailwind arbitrary
  responsive utility that failed to apply on the first SSR paint in production.
  Scoped styles are unlayered and always inlined with this component, so they
  win over (and don't depend on) Tailwind's `@layer utilities` ordering.
  The 80rem breakpoint mirrors Tailwind's `xl`.
*/
.builder-layout {
  display: grid;
  gap: 1.5rem; /* gap-6 */
}

.builder-preview {
  display: none; /* hidden below xl */
}

@media (min-width: 80rem) {
  .builder-layout {
    grid-template-columns: minmax(0, 3fr) minmax(24rem, 2fr);
  }

  .builder-preview {
    display: block;
    position: sticky;
    top: 2rem; /* top-8 */
    align-self: flex-start;
  }
}
</style>
