<script setup lang="ts">
import {
  Lock, Upload, FileText, GripVertical, Plus, Pencil, Trash2,
  ChevronUp, ChevronDown, Check,
} from 'lucide-vue-next'

/**
 * Live application builder: recruiter controls on the left, a real candidate
 * preview on the right. The preview renders the exact same ApplicationFormBody
 * candidates see, in `preview` mode, so the two can never drift. Clicking a
 * field in the preview opens its editor here.
 *
 * Shared between the create-job wizard (step 2) and the per-job application-form
 * page so there is a single application-builder surface across the app.
 */
type QuestionType =
  | 'short_text' | 'long_text' | 'single_select' | 'multi_select'
  | 'number' | 'date' | 'url' | 'checkbox' | 'file_upload' | 'info' | 'rating'

/** Type-specific settings; only rating grids use it today. */
type QuestionConfig = {
  ratingMax?: number
  ratingMinLabel?: string | null
  ratingMaxLabel?: string | null
}

type DraftQuestion = {
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

type DraftSection = {
  id: string
  title: string
  description?: string | null
  displayOrder: number
}

type ApplicationForm = {
  phoneRequirement: 'hidden' | 'optional' | 'required'
  requireResume: boolean
  requireCoverLetter: boolean
  questions: DraftQuestion[]
  sections?: DraftSection[]
}

/**
 * When provided, every edit is persisted immediately through these handlers
 * (used by the per-job application-form page). When omitted, edits are kept in
 * the in-memory model and persisted later by the parent (used by the create-job
 * wizard, which saves everything on job creation).
 */
type BuilderOperations = {
  addQuestion: (data: QuestionInput) => Promise<unknown>
  updateQuestion: (id: string, data: QuestionInput) => Promise<unknown>
  deleteQuestion: (id: string) => Promise<unknown>
  reorderQuestions: (order: { id: string; displayOrder: number }[]) => Promise<unknown>
  setPhoneRequirement: (value: 'hidden' | 'optional' | 'required') => Promise<unknown>
  setRequireResume: (value: boolean) => Promise<unknown>
  setRequireCoverLetter: (value: boolean) => Promise<unknown>
  // Section (wizard page) operations — only wired on the per-job editor.
  addSection?: (data: { title: string; description?: string }) => Promise<unknown>
  updateSection?: (id: string, data: { title?: string; description?: string | null }) => Promise<unknown>
  deleteSection?: (id: string) => Promise<unknown>
  reorderSections?: (order: { id: string; displayOrder: number }[]) => Promise<unknown>
  assignQuestionSection?: (id: string, sectionId: string | null) => Promise<unknown>
}

type QuestionInput = {
  label: string
  type: string
  description?: string
  content?: string
  required: boolean
  options?: string[]
  config?: QuestionConfig | null
  sectionId?: string | null
}

const props = defineProps<{
  /** Optional job title, shown as context above the preview. */
  jobTitle?: string
  /** Immediate-persistence handlers; when absent, edits stay in the model. */
  operations?: BuilderOperations
  /** The create-job wizard renders its preview in a persistent side panel. */
  showPreview?: boolean
}>()

const model = defineModel<ApplicationForm>({ required: true })

const busy = ref(false)

const questionTypeLabels: Record<QuestionType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  single_select: 'Single Select',
  multi_select: 'Multi Select',
  number: 'Number',
  date: 'Date',
  url: 'URL',
  checkbox: 'Checkbox',
  file_upload: 'File Upload',
  info: 'Information block',
  rating: 'Rating scale',
}

const phoneRequirementOptions = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Required' },
] as const

// ─────────────────────────────────────────────
// Question CRUD (operates on the model in place)
// ─────────────────────────────────────────────
const showAddForm = ref(false)
const addInitialType = ref<'short_text' | 'info'>('short_text')
/** Page the "Add" form should attach a new item to (null = default page). */
const addTargetSectionId = ref<string | null>(null)
const editingQuestion = ref<DraftQuestion | null>(null)
const questionActionError = ref<string | null>(null)
let nextQuestionId = 0

function newDraftId() {
  // Stable, collision-free across a session; distinct from server ids.
  return `draft-${Date.now()}-${nextQuestionId++}`
}

function startAdd(type: 'short_text' | 'info' = 'short_text', sectionId: string | null = null) {
  addInitialType.value = type
  addTargetSectionId.value = sectionId
  editingQuestion.value = null
  showAddForm.value = true
  questionActionError.value = null
}

function startEdit(q: DraftQuestion) {
  editingQuestion.value = q
  showAddForm.value = false
  questionActionError.value = null
}

/** Run a delegated persistence handler, surfacing failures inline. */
async function runOp(op: () => Promise<unknown>): Promise<boolean> {
  busy.value = true
  questionActionError.value = null
  try {
    await op()
    return true
  } catch (err: any) {
    questionActionError.value = err?.data?.statusMessage ?? 'Something went wrong. Please try again.'
    return false
  } finally {
    busy.value = false
  }
}

async function handleAddQuestion(data: QuestionInput) {
  // Attach the page the "Add" was launched from (null = default page).
  const payload: QuestionInput = { ...data, sectionId: addTargetSectionId.value }
  if (props.operations) {
    if (await runOp(() => props.operations!.addQuestion(payload))) showAddForm.value = false
    return
  }
  model.value.questions.push({
    id: newDraftId(),
    label: payload.label,
    type: payload.type as QuestionType,
    description: payload.description ?? null,
    content: payload.content ?? null,
    required: payload.required,
    options: payload.options ?? null,
    config: payload.config ?? null,
    sectionId: payload.sectionId ?? null,
  })
  showAddForm.value = false
  questionActionError.value = null
}

async function handleUpdateQuestion(data: QuestionInput) {
  if (!editingQuestion.value) return
  const id = editingQuestion.value.id
  if (props.operations) {
    if (await runOp(() => props.operations!.updateQuestion(id, data))) editingQuestion.value = null
    return
  }
  const index = model.value.questions.findIndex((q) => q.id === id)
  if (index === -1) return
  const existing = model.value.questions[index]
  if (!existing) return
  model.value.questions[index] = {
    id: existing.id,
    label: data.label,
    type: data.type as QuestionType,
    description: data.description ?? null,
    content: data.content ?? null,
    required: data.required,
    options: data.options ?? null,
    config: data.config ?? null,
    sectionId: existing.sectionId ?? null,
  }
  editingQuestion.value = null
  questionActionError.value = null
}

async function handleDeleteQuestion(questionId: string) {
  if (props.operations) {
    if (await runOp(() => props.operations!.deleteQuestion(questionId)) && editingQuestion.value?.id === questionId) {
      editingQuestion.value = null
    }
    return
  }
  const index = model.value.questions.findIndex((q) => q.id === questionId)
  if (index === -1) return
  model.value.questions.splice(index, 1)
  if (editingQuestion.value?.id === questionId) editingQuestion.value = null
  questionActionError.value = null
}

function setRequireResume(value: boolean) {
  if (model.value.requireResume === value) return
  if (props.operations) {
    const prev = model.value.requireResume
    model.value.requireResume = value
    runOp(() => props.operations!.setRequireResume(value)).then((ok) => {
      if (!ok) model.value.requireResume = prev
    })
    return
  }
  model.value.requireResume = value
}

function setPhoneRequirement(value: 'hidden' | 'optional' | 'required') {
  if (model.value.phoneRequirement === value) return
  if (props.operations) {
    const previous = model.value.phoneRequirement
    model.value.phoneRequirement = value
    runOp(() => props.operations!.setPhoneRequirement(value)).then((ok) => {
      if (!ok) model.value.phoneRequirement = previous
    })
    return
  }
  model.value.phoneRequirement = value
}

function setRequireCoverLetter(value: boolean) {
  if (model.value.requireCoverLetter === value) return
  if (props.operations) {
    const prev = model.value.requireCoverLetter
    model.value.requireCoverLetter = value
    runOp(() => props.operations!.setRequireCoverLetter(value)).then((ok) => {
      if (!ok) model.value.requireCoverLetter = prev
    })
    return
  }
  model.value.requireCoverLetter = value
}

// ─────────────────────────────────────────────
// Sections (wizard pages) — only available on the per-job editor, where the
// section operations are wired. The create-job wizard leaves them undefined.
// ─────────────────────────────────────────────
// Sections work in two modes: delegated (per-job editor, persisted via
// operations) and in-memory (create-job wizard, mutating the model directly).
const inMemory = computed(() => !props.operations)
const sectionsEnabled = computed(() => inMemory.value || !!props.operations?.addSection)
const sections = computed<DraftSection[]>(() =>
  [...(model.value.sections ?? [])].sort((a, b) => a.displayOrder - b.displayOrder))

function ensureSectionsArray(): DraftSection[] {
  if (!model.value.sections) model.value.sections = []
  return model.value.sections
}

const showAddSection = ref(false)
const newSectionTitle = ref('')
const editingSectionId = ref<string | null>(null)
const editingSectionTitle = ref('')

async function addSectionRow() {
  const title = newSectionTitle.value.trim()
  if (!title) return
  if (props.operations?.addSection) {
    if (await runOp(() => props.operations!.addSection!({ title }))) {
      newSectionTitle.value = ''
      showAddSection.value = false
    }
    return
  }
  const list = ensureSectionsArray()
  list.push({ id: newDraftId(), title, description: null, displayOrder: list.length })
  newSectionTitle.value = ''
  showAddSection.value = false
}
function startEditSection(s: DraftSection) {
  editingSectionId.value = s.id
  editingSectionTitle.value = s.title
}
async function saveSection(id: string) {
  const title = editingSectionTitle.value.trim()
  if (!title) return
  if (props.operations?.updateSection) {
    if (await runOp(() => props.operations!.updateSection!(id, { title }))) editingSectionId.value = null
    return
  }
  const s = model.value.sections?.find(x => x.id === id)
  if (s) s.title = title
  editingSectionId.value = null
}
async function deleteSectionRow(id: string) {
  if (props.operations?.deleteSection) {
    await runOp(() => props.operations!.deleteSection!(id))
    return
  }
  const list = model.value.sections ?? []
  const idx = list.findIndex(s => s.id === id)
  if (idx >= 0) list.splice(idx, 1)
  // Questions in the removed section fall back to the default page.
  for (const q of model.value.questions) if (q.sectionId === id) q.sectionId = null
}
function moveSection(index: number, direction: 'up' | 'down') {
  const list = sections.value
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return
  if (props.operations?.reorderSections) {
    const reordered = [...list]
    ;[reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]
    const order = reordered.map((s, i) => ({ id: s.id, displayOrder: i }))
    runOp(() => props.operations!.reorderSections!(order))
    return
  }
  // In-memory: swap the two sections' displayOrder on the real model objects.
  const a = model.value.sections?.find(s => s.id === list[index]!.id)
  const b = model.value.sections?.find(s => s.id === list[target]!.id)
  if (a && b) { const tmp = a.displayOrder; a.displayOrder = b.displayOrder; b.displayOrder = tmp }
}
/** Index of a section within the ordered `sections` list (for page up/down). */
function sectionIndex(section: DraftSection): number {
  return sections.value.findIndex(s => s.id === section.id)
}

// ─────────────────────────────────────────────
// Grouping: questions rendered under their page
// ─────────────────────────────────────────────
type QuestionGroup = { section: DraftSection | null, questions: DraftQuestion[] }

/** Sections in displayOrder, then the default/no-page group last (mirrors the
 *  public wizard). With no sections, a single default group holds everything. */
const questionGroups = computed<QuestionGroup[]>(() => {
  const groups: QuestionGroup[] = []
  const knownSectionIds = new Set(sections.value.map(s => s.id))
  for (const s of sections.value) {
    groups.push({ section: s, questions: model.value.questions.filter(q => q.sectionId === s.id) })
  }
  const orphans = model.value.questions.filter(q => !q.sectionId || !knownSectionIds.has(q.sectionId))
  if (orphans.length || sections.value.length === 0) {
    groups.push({ section: null, questions: orphans })
  }
  return groups
})

/** Whether to show page headers (only once real pages exist). */
const showGroupHeaders = computed(() => sectionsEnabled.value && sections.value.length > 0)

/** Page the add form renders in; falls back to the default page if the target
 *  page was deleted while the form was open. */
const addFormGroupId = computed(() => {
  const id = addTargetSectionId.value
  return id && sections.value.some(s => s.id === id) ? id : null
})

// ── Reordering / moving questions ──

/** Persist a new global question order (optimistic locally; operations sync). */
function persistQuestionOrder(list: DraftQuestion[], movedId?: string, movedSection?: string | null, sectionChanged?: boolean) {
  model.value.questions = list
  if (!props.operations) return
  const order = list.map((q, i) => ({ id: q.id, displayOrder: i }))
  runOp(async () => {
    if (sectionChanged && props.operations!.assignQuestionSection && movedId !== undefined) {
      await props.operations!.assignQuestionSection!(movedId, movedSection ?? null)
    }
    await props.operations!.reorderQuestions(order)
  })
}

/** Move a question to a page, before `beforeId` (or the end of that page). */
function moveQuestionTo(draggedId: string, targetSectionId: string | null, beforeId: string | null) {
  if (!draggedId || draggedId === beforeId) return
  const list = [...model.value.questions]
  const fromIdx = list.findIndex(q => q.id === draggedId)
  if (fromIdx === -1) return
  const dragged = list[fromIdx]!
  const sectionChanged = (dragged.sectionId ?? null) !== targetSectionId
  list.splice(fromIdx, 1)
  dragged.sectionId = targetSectionId
  let insertIdx: number
  if (beforeId) {
    insertIdx = list.findIndex(q => q.id === beforeId)
    if (insertIdx === -1) insertIdx = list.length
  }
  else {
    // End of the target page: after the last question already in that section.
    let last = -1
    list.forEach((q, i) => { if ((q.sectionId ?? null) === targetSectionId) last = i })
    insertIdx = last === -1 ? list.length : last + 1
  }
  list.splice(insertIdx, 0, dragged)
  persistQuestionOrder(list, draggedId, targetSectionId, sectionChanged)
}

/** Accessible fallback: move a question up/down within its own page. */
function moveQuestionInGroup(q: DraftQuestion, direction: 'up' | 'down') {
  const groupQs = model.value.questions.filter(x => (x.sectionId ?? null) === (q.sectionId ?? null))
  const gi = groupQs.findIndex(x => x.id === q.id)
  const gt = direction === 'up' ? gi - 1 : gi + 1
  if (gt < 0 || gt >= groupQs.length) return
  if (direction === 'up') {
    moveQuestionTo(q.id, q.sectionId ?? null, groupQs[gt]!.id)
  }
  else {
    const afterTarget = groupQs[gt + 1]
    moveQuestionTo(q.id, q.sectionId ?? null, afterTarget ? afterTarget.id : null)
  }
}

// ── Drag and drop (native HTML5) ──
const draggingId = ref<string | null>(null)
/** Key of the group currently under the drag (section id, or '' for default). */
const dragOverGroup = ref<string | null>(null)

function onDragStart(q: DraftQuestion, e: DragEvent) {
  draggingId.value = q.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', q.id)
  }
}
function onDragEnd() {
  draggingId.value = null
  dragOverGroup.value = null
}
/** Drop onto a specific question row → place the dragged item before it. */
function onDropOnQuestion(target: DraftQuestion) {
  if (draggingId.value) moveQuestionTo(draggingId.value, target.sectionId ?? null, target.id)
  onDragEnd()
}
/** Drop onto a page's body (not a row) → append to that page. */
function onDropOnGroup(section: DraftSection | null) {
  if (draggingId.value) moveQuestionTo(draggingId.value, section?.id ?? null, null)
  onDragEnd()
}

const questionsAnchor = ref<HTMLElement | null>(null)
const documentsAnchor = ref<HTMLElement | null>(null)
const personalInformationAnchor = ref<HTMLElement | null>(null)

/** Clicking a field in the preview jumps to (and opens) its editor on the left. */
function handleEditField(field: string) {
  if (field === 'phone') {
    personalInformationAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  if (field === 'resume' || field === 'coverLetter') {
    documentsAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  if (field.startsWith('question:')) {
    const id = field.slice('question:'.length)
    const q = model.value.questions.find((qq) => qq.id === id)
    if (q) {
      startEdit(q)
      // The editor now opens inline under its row, so scroll to the form itself.
      nextTick(() => {
        const form = questionsAnchor.value?.querySelector('[data-question-form]') as HTMLElement | null
        ;(form ?? questionsAnchor.value)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
    return
  }
  // Name and email are mandatory, fixed fields — nothing to edit.
}
</script>

<template>
  <div
    class="grid grid-cols-1 items-start gap-6 lg:gap-8"
    :class="{ 'lg:grid-cols-2': showPreview !== false }"
    :aria-busy="busy"
  >
    <!-- ── Controls ─────────────────────────────── -->
    <div class="space-y-8">
      <div>
        <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Customize your application form</p>
        <p class="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">
          Edit the form on the left and watch the candidate's view update live. Locked fields are always collected and cannot be turned off.
        </p>
      </div>

      <!-- Personal information -->
      <div ref="personalInformationAnchor">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 pb-3 border-b border-surface-100 dark:border-surface-800">Personal information</h2>
        <div class="divide-y divide-surface-100 dark:divide-surface-800">
          <div
            v-for="field in ['First name', 'Last name', 'Email']"
            :key="field"
            class="flex items-center justify-between py-3.5 px-1"
          >
            <div class="flex items-center gap-2.5">
              <span class="text-sm text-surface-900 dark:text-surface-100">{{ field }}</span>
              <Lock class="size-3 text-surface-300 dark:text-surface-600" />
            </div>
            <span
              class="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-200 dark:ring-brand-800"
            >
              Mandatory
            </span>
          </div>
          <div class="flex flex-col gap-3 py-3.5 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span class="text-sm text-surface-900 dark:text-surface-100">Phone</span>
              <p class="mt-0.5 text-xs text-surface-400 dark:text-surface-500">Choose whether candidates see this field.</p>
            </div>
            <div class="inline-flex self-start rounded-lg bg-surface-100 p-0.5 dark:bg-surface-800" role="radiogroup" aria-label="Phone field requirement">
              <button
                v-for="option in phoneRequirementOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="model.phoneRequirement === option.value"
                class="rounded-md px-2.5 py-1.5 text-xs font-medium transition-all"
                :class="model.phoneRequirement === option.value
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                  : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'"
                @click="setPhoneRequirement(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Documents -->
      <div ref="documentsAnchor">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 pb-3 border-b border-surface-100 dark:border-surface-800">Documents</h2>
        <div class="divide-y divide-surface-100 dark:divide-surface-800">
          <!-- Resume -->
          <div class="flex items-center justify-between py-4 px-1">
            <div>
              <div class="flex items-center gap-2">
                <Upload class="size-4 text-surface-400 dark:text-surface-500" />
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Resume / CV</span>
              </div>
              <p class="text-xs text-surface-400 dark:text-surface-500 mt-1 ml-6">PDF, DOC, or DOCX up to 10 MB</p>
            </div>
            <div class="inline-flex items-center rounded-lg bg-surface-100 dark:bg-surface-800 p-0.5" role="radiogroup" aria-label="Resume requirement">
              <button
                type="button"
                role="radio"
                :aria-checked="model.requireResume"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                :class="model.requireResume ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'"
                @click="setRequireResume(true)"
              >
                Required
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="!model.requireResume"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                :class="!model.requireResume ? 'bg-white dark:bg-surface-700 text-surface-700 dark:text-surface-300 shadow-sm' : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'"
                @click="setRequireResume(false)"
              >
                Off
              </button>
            </div>
          </div>
          <!-- Cover letter -->
          <div class="flex items-center justify-between py-4 px-1">
            <div>
              <div class="flex items-center gap-2">
                <FileText class="size-4 text-surface-400 dark:text-surface-500" />
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Cover letter</span>
              </div>
              <p class="text-xs text-surface-400 dark:text-surface-500 mt-1 ml-6">Free-text field, max 10,000 characters</p>
            </div>
            <div class="inline-flex items-center rounded-lg bg-surface-100 dark:bg-surface-800 p-0.5" role="radiogroup" aria-label="Cover letter requirement">
              <button
                type="button"
                role="radio"
                :aria-checked="model.requireCoverLetter"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                :class="model.requireCoverLetter ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'"
                @click="setRequireCoverLetter(true)"
              >
                Required
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="!model.requireCoverLetter"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                :class="!model.requireCoverLetter ? 'bg-white dark:bg-surface-700 text-surface-700 dark:text-surface-300 shadow-sm' : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'"
                @click="setRequireCoverLetter(false)"
              >
                Off
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pages & questions -->
      <div ref="questionsAnchor">
        <div class="flex items-center justify-between pb-3 border-b border-surface-100 dark:border-surface-800">
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Pages &amp; questions</h2>
            <p class="mt-0.5 text-xs text-surface-400 dark:text-surface-500">
              Group questions into pages for a multi-step form. Personal information is always the first page and Documents the last.
            </p>
          </div>
          <span v-if="model.questions.length > 0" class="text-xs font-medium text-surface-400 dark:text-surface-500 tabular-nums shrink-0">
            {{ model.questions.length }} {{ model.questions.length === 1 ? 'item' : 'items' }}
          </span>
        </div>

        <div
          v-if="questionActionError"
          class="rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950 p-3 text-sm text-danger-700 dark:text-danger-400 mt-4"
        >
          {{ questionActionError }}
          <button class="ml-2 underline" @click="questionActionError = null">Dismiss</button>
        </div>

        <!-- Groups: one per page, then the default/no-page group.
             The add/edit form renders inline: edits open under their own row,
             additions open at the bottom of the page they were launched from. -->
        <div class="mt-4 space-y-5">
          <div
            v-for="group in questionGroups"
            :key="group.section?.id ?? '__default'"
            class="rounded-xl transition-colors"
            :class="[
              showGroupHeaders ? 'border border-surface-200 dark:border-surface-800 p-3' : '',
              draggingId && dragOverGroup === (group.section?.id ?? '') ? 'ring-2 ring-brand-300 dark:ring-brand-700' : '',
            ]"
            @dragover.prevent="dragOverGroup = group.section?.id ?? ''"
            @drop="onDropOnGroup(group.section)"
          >
            <!-- Page header -->
            <div v-if="showGroupHeaders" class="flex items-center gap-2 pb-2 mb-1 border-b border-surface-100 dark:border-surface-800">
              <template v-if="group.section && editingSectionId === group.section.id">
                <input
                  v-model="editingSectionTitle"
                  type="text"
                  maxlength="200"
                  class="flex-1 rounded-lg border border-surface-300 dark:border-surface-700 px-2.5 py-1.5 text-sm bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  @keyup.enter="saveSection(group.section.id)"
                  @keyup.esc="editingSectionId = null"
                />
                <button type="button" class="rounded p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950" title="Save" @click="saveSection(group.section.id)"><Check class="size-4" /></button>
              </template>
              <template v-else>
                <span class="flex-1 text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                  {{ group.section ? group.section.title : 'General (no page)' }}
                </span>
                <div v-if="group.section" class="flex items-center gap-0.5 shrink-0">
                  <button type="button" :disabled="sectionIndex(group.section) === 0" class="rounded p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30" title="Move page up" @click="moveSection(sectionIndex(group.section), 'up')"><ChevronUp class="size-4" /></button>
                  <button type="button" :disabled="sectionIndex(group.section) === sections.length - 1" class="rounded p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30" title="Move page down" @click="moveSection(sectionIndex(group.section), 'down')"><ChevronDown class="size-4" /></button>
                  <button type="button" class="rounded p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800" title="Rename page" @click="startEditSection(group.section)"><Pencil class="size-4" /></button>
                  <button type="button" class="rounded p-1.5 text-surface-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950" title="Delete page" @click="deleteSectionRow(group.section.id)"><Trash2 class="size-4" /></button>
                </div>
              </template>
            </div>

            <!-- Questions in this page -->
            <div class="divide-y divide-surface-100 dark:divide-surface-800">
              <div v-for="(q, qi) in group.questions" :key="q.id">
                <div
                  draggable="true"
                  class="flex items-center gap-3 py-3 px-1 group cursor-move"
                  :class="draggingId === q.id ? 'opacity-40' : ''"
                  @dragstart="onDragStart(q, $event)"
                  @dragend="onDragEnd"
                  @dragover.prevent.stop="dragOverGroup = group.section?.id ?? ''"
                  @drop.stop="onDropOnQuestion(q)"
                >
                  <div class="text-surface-300 dark:text-surface-600 cursor-grab" title="Drag to reorder or move to another page">
                    <GripVertical class="size-4" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{{ q.label || (q.type === 'info' ? 'Information block' : 'Untitled') }}</span>
                      <template v-if="q.type !== 'info'">
                        <span
                          v-if="q.required"
                          class="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-200 dark:ring-brand-800"
                        >
                          Required
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center rounded-md bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400 ring-1 ring-inset ring-surface-200 dark:ring-surface-700"
                        >
                          Optional
                        </span>
                      </template>
                      <span
                        v-else
                        class="inline-flex items-center rounded-md bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400 ring-1 ring-inset ring-surface-200 dark:ring-surface-700"
                      >
                        Info
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 ml-0">
                      <span class="text-xs text-surface-400 dark:text-surface-500">{{ questionTypeLabels[q.type] ?? q.type }}</span>
                      <span v-if="q.description" class="text-xs text-surface-400 dark:text-surface-500 truncate">
                        &middot; {{ q.description }}
                      </span>
                      <span
                        v-if="(q.type === 'single_select' || q.type === 'multi_select') && q.options"
                        class="text-xs text-surface-400 dark:text-surface-500"
                      >
                        &middot; {{ q.options.length }} options
                      </span>
                      <span
                        v-else-if="q.type === 'rating' && q.options"
                        class="text-xs text-surface-400 dark:text-surface-500"
                      >
                        &middot; {{ q.options.length }} {{ q.options.length === 1 ? 'item' : 'items' }}, 1&ndash;{{ q.config?.ratingMax ?? 5 }}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      :disabled="qi === 0"
                      class="rounded p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-30"
                      title="Move up"
                      @click="moveQuestionInGroup(q, 'up')"
                    >
                      <ChevronUp class="size-4" />
                    </button>
                    <button
                      type="button"
                      :disabled="qi === group.questions.length - 1"
                      class="rounded p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-30"
                      title="Move down"
                      @click="moveQuestionInGroup(q, 'down')"
                    >
                      <ChevronDown class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="rounded p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                      title="Edit"
                      @click="startEdit(q)"
                    >
                      <Pencil class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="rounded p-1.5 text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors"
                      title="Delete"
                      @click="handleDeleteQuestion(q.id)"
                    >
                      <Trash2 class="size-4" />
                    </button>
                  </div>
                </div>

                <!-- Edit form opens directly under the item being edited -->
                <QuestionForm
                  v-if="editingQuestion && editingQuestion.id === q.id"
                  :key="`edit-${q.id}`"
                  data-question-form
                  :question="editingQuestion"
                  class="mb-3"
                  @save="handleUpdateQuestion"
                  @cancel="editingQuestion = null"
                />
              </div>
            </div>

            <p v-if="group.questions.length === 0" class="text-xs text-surface-400 dark:text-surface-500 py-3 text-center">
              {{ showGroupHeaders ? 'Drag questions here, or add one below.' : 'No questions added yet.' }}
            </p>

            <!-- Add form opens at the bottom of the page it was launched from -->
            <QuestionForm
              v-if="showAddForm && addFormGroupId === (group.section?.id ?? null)"
              data-question-form
              class="mt-3"
              :initial-type="addInitialType"
              @save="handleAddQuestion"
              @cancel="showAddForm = false"
            />

            <!-- Per-page add buttons -->
            <div v-if="!showAddForm && !editingQuestion" class="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-dashed border-surface-300 dark:border-surface-700 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 transition-colors"
                @click="startAdd('short_text', group.section?.id ?? null)"
              >
                <Plus class="size-3.5" /> Add a question
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-dashed border-surface-300 dark:border-surface-700 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 transition-colors"
                @click="startAdd('info', group.section?.id ?? null)"
              >
                <Plus class="size-3.5" /> Add information block
              </button>
            </div>
          </div>
        </div>

        <!-- Add a page -->
        <div v-if="sectionsEnabled" class="mt-4 flex items-center gap-2">
          <template v-if="showAddSection">
            <input
              v-model="newSectionTitle"
              type="text"
              maxlength="200"
              placeholder="Page title (e.g. Experience)"
              class="flex-1 max-w-xs rounded-lg border border-surface-300 dark:border-surface-700 px-2.5 py-1.5 text-sm bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              @keyup.enter="addSectionRow"
            />
            <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" :disabled="!newSectionTitle.trim()" @click="addSectionRow">Add page</button>
            <button type="button" class="text-sm text-surface-400 hover:text-surface-600" @click="showAddSection = false; newSectionTitle = ''">Cancel</button>
          </template>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-surface-300 dark:border-surface-700 px-3 py-2 text-sm font-medium text-surface-600 dark:text-surface-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
            @click="showAddSection = true"
          >
            <Plus class="size-4" /> Add a page
          </button>
        </div>
      </div>
    </div>

    <!-- ── Live preview ─────────────────────────── -->
    <div v-if="showPreview !== false" class="lg:sticky lg:top-4">
      <ApplicationBuilderPreview
        :application-form="model"
        :job-details="{ title: jobTitle }"
        @edit-field="handleEditField"
      />
    </div>
  </div>
</template>
