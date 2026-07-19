<script setup lang="ts">
import { X, Plus, Trash2, Loader2, CalendarClock, Check, AlertTriangle, ExternalLink } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  jobId: string
}>()

const emit = defineEmits<{ close: [] }>()

const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

interface Slot {
  id: string
  title: string
  type: string
  startsAt: string
  duration: number
  timezone: string
  location: string | null
  capacity: number
  bookedCount: number
  available: number
  status: 'open' | 'closed' | 'cancelled'
  generated?: boolean
}

const slots = ref<Slot[]>([])
const loading = ref(false)
const creating = ref(false)

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

const form = reactive({
  title: '',
  type: 'video',
  date: '',
  time: '10:00',
  duration: 60,
  capacity: 1,
  location: '',
})

const interviewTypes = [
  { value: 'video', label: 'Video Call' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'in_person', label: 'In Person' },
  { value: 'panel', label: 'Panel' },
  { value: 'technical', label: 'Technical' },
  { value: 'take_home', label: 'Take-Home' },
]

// ── Job-level availability (length + per-date windows → generated slots) ─────

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120]
const MAX_DATE_ROWS = 92

const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

const avail = reactive({
  title: 'Interview',
  type: 'video',
  duration: 60,
  capacity: 1,
  location: '',
  dateFrom: '',
  dateTo: '',
  windowStart: '09:00',
  windowEnd: '17:00',
  breakStart: '',
  breakEnd: '',
  buffer: 0,
  invitationTemplateId: '',
})

// Per-date rows: only checked dates get slots; each date can override the
// default daily window.
interface DateRow {
  date: string
  label: string
  isWeekend: boolean
  enabled: boolean
  windowStart: string
  windowEnd: string
}
const dateRows = ref<DateRow[]>([])
const dateRangeTooLong = ref(false)

function formatDateRowLabel(date: string): { label: string, isWeekend: boolean } {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  return {
    label: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    isWeekend: dt.getUTCDay() === 0 || dt.getUTCDay() === 6,
  }
}

function nextDateStr(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10)
}

/**
 * Rebuild the per-date rows for the current range, preserving what the user
 * already toggled/customized. `presetDates` (from a saved availability)
 * overrides the defaults for matching dates.
 */
function rebuildDateRows(presetDates?: Array<{ date: string, windowStart?: string | null, windowEnd?: string | null }>) {
  if (!avail.dateFrom || !avail.dateTo || avail.dateFrom > avail.dateTo) {
    dateRows.value = []
    dateRangeTooLong.value = false
    return
  }
  const existing = new Map(dateRows.value.map(r => [r.date, r]))
  const preset = new Map((presetDates ?? []).map(p => [p.date, p]))
  const rows: DateRow[] = []
  dateRangeTooLong.value = false
  for (let day = avail.dateFrom; day <= avail.dateTo; day = nextDateStr(day)) {
    if (rows.length >= MAX_DATE_ROWS) {
      dateRangeTooLong.value = true
      break
    }
    const { label, isWeekend } = formatDateRowLabel(day)
    const prev = existing.get(day)
    const pre = preset.get(day)
    rows.push({
      date: day,
      label,
      isWeekend,
      enabled: pre ? true : prev ? prev.enabled : (presetDates ? false : !isWeekend),
      windowStart: pre?.windowStart ?? prev?.windowStart ?? avail.windowStart,
      windowEnd: pre?.windowEnd ?? prev?.windowEnd ?? avail.windowEnd,
    })
  }
  dateRows.value = rows
}

// From/To constraints: To can never precede From; range changes rebuild rows.
watch(() => avail.dateFrom, (from) => {
  if (from && avail.dateTo && avail.dateTo < from) avail.dateTo = from
  rebuildDateRows()
})
watch(() => avail.dateTo, () => rebuildDateRows())

const enabledDateRows = computed(() => dateRows.value.filter(r => r.enabled))

/** Push the default daily window onto every date row. */
function applyWindowToAllDates() {
  for (const r of dateRows.value) {
    r.windowStart = avail.windowStart
    r.windowEnd = avail.windowEnd
  }
}

function toggleAllDates(enabled: boolean) {
  for (const r of dateRows.value) r.enabled = enabled
}

// Invitation template choices: the built-in default + this org's custom
// self-schedule templates (other types use variables that don't exist here).
const { templates: orgTemplates } = useEmailTemplates()
const invitationTemplateOptions = computed(() => [
  { value: '', label: 'Built-in: Self-Schedule Invitation' },
  ...orgTemplates.value
    .filter(t => (t as { templateType?: string }).templateType === 'self_schedule_invitation')
    .map(t => ({ value: t.id, label: t.name })),
])
const hasAvailability = ref(false)
const savingAvailability = ref(false)

async function loadAvailability() {
  try {
    const res = await $fetch<{ availability: (typeof avail & { id: string }) | null }>(
      `/api/jobs/${props.jobId}/interview-availability`,
    )
    if (res.availability) {
      hasAvailability.value = true
      avail.title = res.availability.title
      avail.type = res.availability.type
      avail.duration = res.availability.duration
      avail.capacity = res.availability.capacity
      avail.location = res.availability.location ?? ''
      avail.dateFrom = res.availability.dateFrom
      avail.dateTo = res.availability.dateTo
      avail.windowStart = res.availability.windowStart
      avail.windowEnd = res.availability.windowEnd
      avail.breakStart = (res.availability as any).breakStart ?? ''
      avail.breakEnd = (res.availability as any).breakEnd ?? ''
      avail.buffer = (res.availability as any).buffer ?? 0
      avail.invitationTemplateId = (res.availability as any).invitationTemplateId ?? ''
      const savedDates = (res.availability as any).dates as Array<{ date: string, windowStart?: string, windowEnd?: string }> | null
      rebuildDateRows(savedDates?.length ? savedDates : undefined)
    }
  }
  catch {
    // Non-fatal — the manual slot list still works.
  }
}

const canSaveAvailability = computed(() =>
  !!avail.dateFrom && !!avail.dateTo && avail.dateFrom <= avail.dateTo
  && enabledDateRows.value.length > 0
  && enabledDateRows.value.every(r => r.windowStart < r.windowEnd)
  && !!avail.windowStart && !!avail.windowEnd && !!avail.title.trim()
  && !!avail.breakStart === !!avail.breakEnd,
)

async function saveAvailability(opts: { priorMode: 'replace-all' | 'replace-auto' | 'keep', bookedAction: 'keep' | 'rebook' }) {
  if (!canSaveAvailability.value || savingAvailability.value) return
  savingAvailability.value = true
  try {
    const res = await $fetch<{ created: number, removed: number, rebooked: number, truncated: boolean }>(
      `/api/jobs/${props.jobId}/interview-availability`,
      {
        method: 'PUT',
        body: {
          priorMode: opts.priorMode,
          bookedAction: opts.bookedAction,
          title: avail.title.trim(),
          type: avail.type,
          duration: avail.duration,
          capacity: avail.capacity,
          location: avail.location.trim() || null,
          timezone: localTz,
          dateFrom: avail.dateFrom,
          dateTo: avail.dateTo,
          dates: enabledDateRows.value.map(r => ({
            date: r.date,
            windowStart: r.windowStart,
            windowEnd: r.windowEnd,
          })),
          windowStart: avail.windowStart,
          windowEnd: avail.windowEnd,
          breakStart: avail.breakStart || null,
          breakEnd: avail.breakEnd || null,
          buffer: avail.buffer,
          invitationTemplateId: avail.invitationTemplateId || null,
        },
      },
    )
    hasAvailability.value = true
    showSaveConfirm.value = false
    toast.success(
      'Availability saved',
      `${res.created} time${res.created === 1 ? '' : 's'} generated`
      + (res.removed ? `, ${res.removed} replaced` : '')
      + (res.rebooked ? `, ${res.rebooked} candidate${res.rebooked === 1 ? '' : 's'} sent a new time picker` : '')
      + (res.truncated ? ' (capped — narrow the date range for more control)' : ''),
    )
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    // Surface the actual failing rule from a zod validation error when present.
    const issue = err?.data?.data?.issues?.[0]?.message ?? err?.data?.data?.[0]?.message
    toast.error('Failed to save availability', {
      message: issue ?? err?.data?.statusMessage,
      statusCode: err?.data?.statusCode,
    })
  }
  finally {
    savingAvailability.value = false
  }
}

async function loadSlots() {
  loading.value = true
  try {
    const res = await $fetch<{ data: Slot[] }>('/api/interview-slots', { query: { jobId: props.jobId } })
    slots.value = res.data
  }
  catch (err: any) {
    toast.error('Failed to load slots', { message: err?.data?.statusMessage })
  }
  finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) {
    form.title = ''
    form.date = ''
    form.time = '10:00'
    form.duration = 60
    form.capacity = 1
    form.location = ''
    loadSlots()
    loadAvailability()
  }
})

async function createSlot() {
  if (!form.title.trim() || !form.date || !form.time || creating.value) return
  const startsAt = new Date(`${form.date}T${form.time}`)
  if (Number.isNaN(startsAt.getTime())) {
    toast.error('Invalid date/time')
    return
  }
  creating.value = true
  try {
    await $fetch('/api/interview-slots', {
      method: 'POST',
      body: {
        jobId: props.jobId,
        title: form.title.trim(),
        type: form.type,
        startsAt: startsAt.toISOString(),
        duration: form.duration,
        timezone: localTz,
        capacity: form.capacity,
        location: form.location.trim() || undefined,
      },
    })
    toast.success('Slot created')
    form.title = ''
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to create slot', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    creating.value = false
  }
}

// ── Multi-select + bulk removal ──────────────────────────────────────────────

const selectedSlotIds = ref<Set<string>>(new Set())

function toggleSlotSelect(id: string) {
  const next = new Set(selectedSlotIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedSlotIds.value = next
}

function clearSlotSelection() {
  selectedSlotIds.value = new Set()
}

const selectedBookedCount = computed(() =>
  slots.value.filter(s => selectedSlotIds.value.has(s.id) && s.bookedCount > 0).length,
)

const showBulkRemoveConfirm = ref(false)
const bulkBookedMode = ref<'skip' | 'cancel-interviews'>('skip')
const bulkRemoving = ref(false)

async function bulkRemoveSelected() {
  if (bulkRemoving.value || !selectedSlotIds.value.size) return
  bulkRemoving.value = true
  try {
    const res = await $fetch<{ deleted: number, cancelled: number, skippedBooked: number, cancelledInterviews: number }>(
      '/api/interview-slots/bulk-delete',
      { method: 'POST', body: { slotIds: [...selectedSlotIds.value], bookedMode: bulkBookedMode.value } },
    )
    const parts = [
      `${res.deleted + res.cancelled} removed`,
      res.cancelledInterviews ? `${res.cancelledInterviews} interview${res.cancelledInterviews === 1 ? '' : 's'} cancelled` : '',
      res.skippedBooked ? `${res.skippedBooked} with assignees kept` : '',
    ].filter(Boolean)
    toast.success('Slots removed', parts.join(', '))
    showBulkRemoveConfirm.value = false
    clearSlotSelection()
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to remove slots', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    bulkRemoving.value = false
  }
}

// ── Save-availability confirmation (regeneration) ────────────────────────────

const showSaveConfirm = ref(false)
const savePriorMode = ref<'replace-all' | 'keep'>('replace-all')
const saveBookedAction = ref<'keep' | 'rebook'>('keep')

const futureOpenCount = computed(() =>
  slots.value.filter(s => s.status !== 'cancelled' && s.bookedCount === 0 && new Date(s.startsAt) > new Date()).length,
)
const futureBookedCount = computed(() =>
  slots.value.filter(s => s.bookedCount > 0 && new Date(s.startsAt) > new Date()).length,
)

/** Entry point for the Save button: prompt when prior slots exist. */
function requestSaveAvailability() {
  if (!canSaveAvailability.value || savingAvailability.value) return
  if (futureOpenCount.value > 0 || futureBookedCount.value > 0) {
    savePriorMode.value = 'replace-all'
    saveBookedAction.value = 'keep'
    showSaveConfirm.value = true
    return
  }
  saveAvailability({ priorMode: 'replace-all', bookedAction: 'keep' })
}

// ── Single delete with assignees ─────────────────────────────────────────────

interface SlotBookingInfo {
  interviewId: string | null
  applicationId: string
  candidateName: string
}
const deleteBlocked = ref<{ slot: Slot, bookings: SlotBookingInfo[] } | null>(null)
const deletingWithCancel = ref(false)

async function confirmDeleteWithCancel() {
  if (!deleteBlocked.value || deletingWithCancel.value) return
  deletingWithCancel.value = true
  try {
    const res = await $fetch<{ cancelledInterviews: number }>(
      `/api/interview-slots/${deleteBlocked.value.slot.id}`,
      { method: 'DELETE', query: { mode: 'cancel-interviews' } },
    )
    toast.success('Slot removed', `${res.cancelledInterviews} interview${res.cancelledInterviews === 1 ? '' : 's'} cancelled and the candidates notified`)
    deleteBlocked.value = null
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to remove slot', { message: err?.data?.statusMessage })
  }
  finally {
    deletingWithCancel.value = false
  }
}

async function toggleStatus(slot: Slot) {
  const next = slot.status === 'open' ? 'closed' : 'open'
  try {
    await $fetch(`/api/interview-slots/${slot.id}`, { method: 'PATCH', body: { status: next } })
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update slot', { message: err?.data?.statusMessage })
  }
}

async function deleteSlot(slot: Slot) {
  try {
    await $fetch(`/api/interview-slots/${slot.id}`, { method: 'DELETE' })
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    // 409 = the slot has assignees; ask whether to cancel their interviews or
    // move them via reschedule instead.
    if (err?.status === 409 || err?.statusCode === 409 || err?.data?.statusCode === 409) {
      deleteBlocked.value = {
        slot,
        bookings: err?.data?.data?.bookings ?? [],
      }
      return
    }
    toast.error('Failed to remove slot', { message: err?.data?.statusMessage })
  }
}

function formatSlot(s: Slot) {
  return new Date(s.startsAt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: localTz,
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
      <div class="relative w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-surface-900 shadow-2xl ring-1 ring-surface-200/80 dark:ring-surface-700/60 p-5 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between mb-1 shrink-0">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <CalendarClock class="size-4" /> Interview slots
          </h3>
          <button class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4 shrink-0">
          Set availability for the whole job — invited candidates pick an open time first-come. Times are in your local timezone ({{ localTz }}).
        </p>

        <div class="flex-1 overflow-y-auto -mx-1 px-1">
        <!-- Job availability -->
        <div class="rounded-xl border border-brand-200 dark:border-brand-800/60 bg-brand-50/40 dark:bg-brand-950/20 p-3 mb-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 mb-2">
            Availability
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input v-model="avail.title" type="text" placeholder="Interview title" class="col-span-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select v-model="avail.type" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option v-for="t in interviewTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <select v-model.number="avail.duration" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ d }} min</option>
            </select>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              From
              <input v-model="avail.dateFrom" type="date" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              To
              <input v-model="avail.dateTo" type="date" :min="avail.dateFrom || undefined" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Default hours from
              <input v-model="avail.windowStart" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Default hours until
              <input v-model="avail.windowEnd" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Break from <span class="sr-only">(optional)</span>
              <input v-model="avail.breakStart" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Break until
              <input v-model="avail.breakEnd" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-2 flex flex-col gap-1 text-[11px] text-surface-500">
              Gap between interviews
              <select v-model.number="avail.buffer" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option v-for="b in BUFFER_OPTIONS" :key="b" :value="b">{{ b === 0 ? 'None (back-to-back)' : `${b} minutes` }}</option>
              </select>
            </label>
          </div>
          <p class="mt-1.5 text-[11px] text-surface-400 dark:text-surface-500">
            Leave the break fields empty for no break. Nothing can be booked during the break, and the gap is kept free between interviews.
          </p>
          <!-- Per-date selection: only checked dates get slots; each can have
               its own window. -->
          <div v-if="dateRows.length" class="mt-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-white/60 dark:bg-surface-900/40">
            <div class="flex items-center gap-2 px-2.5 py-1.5 border-b border-surface-100 dark:border-surface-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
                Dates ({{ enabledDateRows.length }}/{{ dateRows.length }} selected)
              </span>
              <button type="button" class="ml-auto text-[11px] text-brand-600 dark:text-brand-400 underline underline-offset-2" @click="toggleAllDates(true)">All</button>
              <button type="button" class="text-[11px] text-brand-600 dark:text-brand-400 underline underline-offset-2" @click="toggleAllDates(false)">None</button>
              <button type="button" class="text-[11px] text-brand-600 dark:text-brand-400 underline underline-offset-2" @click="applyWindowToAllDates">Apply default hours to all</button>
            </div>
            <div class="max-h-44 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-800">
              <div
                v-for="r in dateRows"
                :key="r.date"
                class="flex items-center gap-2 px-2.5 py-1.5"
                :class="r.enabled ? '' : 'opacity-50'"
              >
                <button
                  type="button"
                  class="size-4 shrink-0 rounded border flex items-center justify-center transition-colors"
                  :class="r.enabled ? 'bg-brand-600 border-brand-600 text-white' : 'border-surface-300 dark:border-surface-600'"
                  :aria-label="r.enabled ? `Exclude ${r.label}` : `Include ${r.label}`"
                  @click="r.enabled = !r.enabled"
                >
                  <Check v-if="r.enabled" class="size-3" />
                </button>
                <span class="w-24 shrink-0 text-xs font-medium" :class="r.isWeekend ? 'text-surface-400 dark:text-surface-500' : 'text-surface-700 dark:text-surface-300'">
                  {{ r.label }}
                </span>
                <input
                  v-model="r.windowStart"
                  type="time"
                  :disabled="!r.enabled"
                  class="rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-1.5 py-1 text-xs text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                />
                <span class="text-[11px] text-surface-400">–</span>
                <input
                  v-model="r.windowEnd"
                  type="time"
                  :disabled="!r.enabled"
                  class="rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-1.5 py-1 text-xs text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                />
                <span v-if="r.enabled && r.windowStart >= r.windowEnd" class="text-[11px] text-danger-600 dark:text-danger-400">end before start</span>
              </div>
            </div>
            <p v-if="dateRangeTooLong" class="px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400 border-t border-surface-100 dark:border-surface-800">
              Showing the first {{ dateRows.length }} days — shorten the range to manage the rest.
            </p>
          </div>
          <p v-else class="mt-2 text-[11px] text-surface-400 dark:text-surface-500">
            Pick a From and To date above, then choose which dates get interview slots.
          </p>

          <div class="mt-2 flex items-center justify-end">
            <label class="flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-300">
              <span class="text-[11px] text-surface-500">Candidates per time</span>
              <input v-model.number="avail.capacity" type="number" min="1" max="100" class="w-14 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>
          <input v-model="avail.location" type="text" placeholder="Location / link (optional)" class="mt-2 w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <label class="mt-2 flex flex-col gap-1 text-[11px] text-surface-500">
            Invitation email template
            <select v-model="avail.invitationTemplateId" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option v-for="o in invitationTemplateOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <div class="flex items-center justify-between gap-4 mt-2.5">
            <span class="min-w-0 text-[11px] text-surface-500 dark:text-surface-400">
              Saving replaces future auto-generated times nobody has booked. Manual and booked times are kept.
            </span>
            <button
              :disabled="!canSaveAvailability || savingAvailability"
              class="shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="requestSaveAvailability"
            >
              <Loader2 v-if="savingAvailability" class="size-4 animate-spin" />
              <CalendarClock v-else class="size-4" />
              {{ hasAvailability ? 'Update availability' : 'Save availability' }}
            </button>
          </div>
        </div>

        <!-- One-off slot form -->
        <div class="rounded-xl border border-surface-200 dark:border-surface-800 p-3 mb-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-2">
            Add a one-off time
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input v-model="form.title" type="text" placeholder="Title (e.g. Phone screen)" class="col-span-2 sm:col-span-3 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input v-model="form.date" type="date" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input v-model="form.time" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select v-model="form.type" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option v-for="t in interviewTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <label class="flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-300">
              <span class="text-xs text-surface-500">Min</span>
              <input v-model.number="form.duration" type="number" min="5" max="480" class="w-16 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-300">
              <span class="text-xs text-surface-500">Capacity</span>
              <input v-model.number="form.capacity" type="number" min="1" max="100" class="w-16 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <input v-model="form.location" type="text" placeholder="Location / link (optional)" class="col-span-2 sm:col-span-3 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div class="flex justify-end mt-2.5">
            <button
              :disabled="!form.title.trim() || !form.date || !form.time || creating"
              class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="createSlot"
            >
              <Loader2 v-if="creating" class="size-4 animate-spin" />
              <Plus v-else class="size-4" />
              Add slot
            </button>
          </div>
        </div>

        <!-- Slot list -->
        <div>
          <div v-if="loading" class="flex items-center justify-center py-8 text-surface-400">
            <Loader2 class="size-5 animate-spin" />
          </div>
          <div v-else-if="!slots.length" class="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
            No bookable times yet. Save availability above (or add a one-off time).
          </div>
          <template v-else>
          <!-- Bulk actions -->
          <div v-if="selectedSlotIds.size" class="flex items-center gap-2 mb-2 rounded-lg border border-brand-200 dark:border-brand-800/60 bg-brand-50 dark:bg-brand-950/40 px-3 py-1.5">
            <span class="text-xs font-medium text-brand-800 dark:text-brand-200">{{ selectedSlotIds.size }} selected</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md bg-danger-600 px-2 py-1 text-xs font-semibold text-white hover:bg-danger-700"
              @click="bulkBookedMode = 'skip'; showBulkRemoveConfirm = true"
            >
              <Trash2 class="size-3" />
              Remove selected
            </button>
            <button
              type="button"
              class="ml-auto text-[11px] text-brand-700 dark:text-brand-300 underline underline-offset-2"
              @click="clearSlotSelection"
            >
              Clear
            </button>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="s in slots"
              :key="s.id"
              class="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-2"
              :class="s.status === 'cancelled' ? 'opacity-50' : ''"
            >
              <button
                type="button"
                class="size-4 shrink-0 rounded border flex items-center justify-center transition-colors"
                :class="selectedSlotIds.has(s.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-surface-300 dark:border-surface-600'"
                :aria-label="selectedSlotIds.has(s.id) ? 'Deselect' : 'Select'"
                @click="toggleSlotSelect(s.id)"
              >
                <Check v-if="selectedSlotIds.has(s.id)" class="size-3" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                  {{ s.title }}
                  <span v-if="s.generated" class="ml-1 rounded bg-surface-100 dark:bg-surface-800 px-1 py-0.5 text-[10px] font-normal text-surface-500 dark:text-surface-400 align-middle">auto</span>
                </div>
                <div class="text-xs text-surface-500">{{ formatSlot(s) }} · {{ s.duration }}m</div>
              </div>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="s.available > 0 && s.status === 'open'
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                  : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'"
              >
                {{ s.bookedCount }}/{{ s.capacity }} booked
              </span>
              <button
                v-if="s.status !== 'cancelled'"
                class="shrink-0 rounded-md border border-surface-200 dark:border-surface-700 px-2 py-1 text-[11px] font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
                @click="toggleStatus(s)"
              >
                {{ s.status === 'open' ? 'Close' : 'Reopen' }}
              </button>
              <button
                class="shrink-0 rounded-md p-1 text-surface-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/40"
                title="Remove slot"
                @click="deleteSlot(s)"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </div>
          </template>
        </div>
        </div>

        <!-- Confirm: save availability over existing times -->
        <div v-if="showSaveConfirm" class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[2px]">
          <div class="w-full max-w-md mx-6 rounded-xl bg-white dark:bg-surface-900 shadow-xl ring-1 ring-surface-200 dark:ring-surface-700 p-4">
            <h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">Replace the existing schedule?</h4>
            <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
              This job already has {{ futureOpenCount }} open time{{ futureOpenCount === 1 ? '' : 's' }}<span v-if="futureBookedCount"> and {{ futureBookedCount }} booked</span>.
            </p>

            <div class="space-y-1.5 mb-3">
              <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                <input v-model="savePriorMode" type="radio" value="replace-all" class="mt-0.5 accent-brand-600" />
                <span>Remove all prior open times and use the new schedule</span>
              </label>
              <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                <input v-model="savePriorMode" type="radio" value="keep" class="mt-0.5 accent-brand-600" />
                <span>Keep the existing open times and add the new ones alongside</span>
              </label>
            </div>

            <template v-if="futureBookedCount">
              <div class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-1.5">
                {{ futureBookedCount }} time{{ futureBookedCount === 1 ? ' has' : 's have' }} candidates assigned
              </div>
              <div class="space-y-1.5 mb-3">
                <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                  <input v-model="saveBookedAction" type="radio" value="keep" class="mt-0.5 accent-brand-600" />
                  <span>Keep their booked times — move them manually later if needed</span>
                </label>
                <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                  <input v-model="saveBookedAction" type="radio" value="rebook" class="mt-0.5 accent-brand-600" />
                  <span>Cancel their interviews and email each candidate a new time picker</span>
                </label>
              </div>
            </template>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
                @click="showSaveConfirm = false"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="savingAvailability"
                class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                @click="saveAvailability({ priorMode: savePriorMode, bookedAction: saveBookedAction })"
              >
                <Loader2 v-if="savingAvailability" class="size-4 animate-spin" />
                Save schedule
              </button>
            </div>
          </div>
        </div>

        <!-- Confirm: bulk remove -->
        <div v-if="showBulkRemoveConfirm" class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[2px]">
          <div class="w-full max-w-md mx-6 rounded-xl bg-white dark:bg-surface-900 shadow-xl ring-1 ring-surface-200 dark:ring-surface-700 p-4">
            <h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">
              Remove {{ selectedSlotIds.size }} slot{{ selectedSlotIds.size === 1 ? '' : 's' }}?
            </h4>
            <template v-if="selectedBookedCount">
              <p class="text-xs text-surface-500 dark:text-surface-400 mb-2">
                {{ selectedBookedCount }} of them {{ selectedBookedCount === 1 ? 'has' : 'have' }} candidates assigned.
              </p>
              <div class="space-y-1.5 mb-3">
                <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                  <input v-model="bulkBookedMode" type="radio" value="skip" class="mt-0.5 accent-brand-600" />
                  <span>Keep the booked ones — remove only the empty slots</span>
                </label>
                <label class="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300">
                  <input v-model="bulkBookedMode" type="radio" value="cancel-interviews" class="mt-0.5 accent-brand-600" />
                  <span>Also cancel the booked interviews and notify the candidates</span>
                </label>
              </div>
            </template>
            <p v-else class="text-xs text-surface-500 dark:text-surface-400 mb-3">None of the selected slots have candidates assigned.</p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
                @click="showBulkRemoveConfirm = false"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="bulkRemoving"
                class="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-danger-700 disabled:opacity-40"
                @click="bulkRemoveSelected"
              >
                <Loader2 v-if="bulkRemoving" class="size-4 animate-spin" />
                Remove
              </button>
            </div>
          </div>
        </div>

        <!-- Confirm: delete a slot with assignees -->
        <div v-if="deleteBlocked" class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[2px]">
          <div class="w-full max-w-md mx-6 rounded-xl bg-white dark:bg-surface-900 shadow-xl ring-1 ring-surface-200 dark:ring-surface-700 p-4">
            <h4 class="flex items-center gap-1.5 text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">
              <AlertTriangle class="size-4 text-amber-500" />
              This time has candidates assigned
            </h4>
            <p class="text-xs text-surface-500 dark:text-surface-400 mb-2">
              {{ formatSlot(deleteBlocked.slot) }} — cancel their interview{{ deleteBlocked.bookings.length === 1 ? '' : 's' }} entirely, or move them to another time first?
            </p>
            <ul class="mb-3 space-y-1">
              <li
                v-for="b in deleteBlocked.bookings"
                :key="b.applicationId"
                class="flex items-center justify-between gap-2 text-sm text-surface-700 dark:text-surface-300"
              >
                <span class="truncate">{{ b.candidateName }}</span>
                <NuxtLink
                  v-if="b.interviewId"
                  :to="$localePath(`/dashboard/interviews/${b.interviewId}`)"
                  target="_blank"
                  class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 underline underline-offset-2"
                >
                  Move (reschedule)
                  <ExternalLink class="size-3" />
                </NuxtLink>
              </li>
            </ul>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
                @click="deleteBlocked = null"
              >
                Keep slot
              </button>
              <button
                type="button"
                :disabled="deletingWithCancel"
                class="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-danger-700 disabled:opacity-40"
                @click="confirmDeleteWithCancel"
              >
                <Loader2 v-if="deletingWithCancel" class="size-4 animate-spin" />
                Cancel interview{{ deleteBlocked.bookings.length === 1 ? '' : 's' }} &amp; remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
