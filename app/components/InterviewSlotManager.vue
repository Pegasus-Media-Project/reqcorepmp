<script setup lang="ts">
import { X, Plus, Trash2, Loader2, CalendarClock } from 'lucide-vue-next'

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

// ── Job-level availability (length + windows → generated slots) ──────────────

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120]

const avail = reactive({
  title: 'Interview',
  type: 'video',
  duration: 60,
  capacity: 1,
  location: '',
  dateFrom: '',
  dateTo: '',
  daysOfWeek: [1, 2, 3, 4, 5] as number[],
  windowStart: '09:00',
  windowEnd: '17:00',
})
const hasAvailability = ref(false)
const savingAvailability = ref(false)

function toggleDay(day: number) {
  avail.daysOfWeek = avail.daysOfWeek.includes(day)
    ? avail.daysOfWeek.filter(d => d !== day)
    : [...avail.daysOfWeek, day]
}

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
      avail.daysOfWeek = res.availability.daysOfWeek
      avail.windowStart = res.availability.windowStart
      avail.windowEnd = res.availability.windowEnd
    }
  }
  catch {
    // Non-fatal — the manual slot list still works.
  }
}

const canSaveAvailability = computed(() =>
  !!avail.dateFrom && !!avail.dateTo && avail.daysOfWeek.length > 0
  && !!avail.windowStart && !!avail.windowEnd && !!avail.title.trim(),
)

async function saveAvailability() {
  if (!canSaveAvailability.value || savingAvailability.value) return
  savingAvailability.value = true
  try {
    const res = await $fetch<{ created: number, removed: number, truncated: boolean }>(
      `/api/jobs/${props.jobId}/interview-availability`,
      {
        method: 'PUT',
        body: {
          title: avail.title.trim(),
          type: avail.type,
          duration: avail.duration,
          capacity: avail.capacity,
          location: avail.location.trim() || null,
          timezone: localTz,
          dateFrom: avail.dateFrom,
          dateTo: avail.dateTo,
          daysOfWeek: avail.daysOfWeek,
          windowStart: avail.windowStart,
          windowEnd: avail.windowEnd,
        },
      },
    )
    hasAvailability.value = true
    toast.success(
      'Availability saved',
      `${res.created} time${res.created === 1 ? '' : 's'} generated`
      + (res.removed ? `, ${res.removed} replaced` : '')
      + (res.truncated ? ' (capped — narrow the date range for more control)' : ''),
    )
    await loadSlots()
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save availability', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
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
              <input v-model="avail.dateTo" type="date" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Daily from
              <input v-model="avail.windowStart" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label class="col-span-1 flex flex-col gap-1 text-[11px] text-surface-500">
              Daily until
              <input v-model="avail.windowEnd" type="time" class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              v-for="d in DAY_OPTIONS"
              :key="d.value"
              type="button"
              class="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
              :class="avail.daysOfWeek.includes(d.value)
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:border-brand-400'"
              @click="toggleDay(d.value)"
            >
              {{ d.label }}
            </button>
            <label class="ml-auto flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-300">
              <span class="text-[11px] text-surface-500">Candidates per time</span>
              <input v-model.number="avail.capacity" type="number" min="1" max="100" class="w-14 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>
          <input v-model="avail.location" type="text" placeholder="Location / link (optional)" class="mt-2 w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div class="flex items-center justify-between mt-2.5">
            <span class="text-[11px] text-surface-500 dark:text-surface-400">
              Saving replaces future auto-generated times nobody has booked. Manual and booked times are kept.
            </span>
            <button
              :disabled="!canSaveAvailability || savingAvailability"
              class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="saveAvailability"
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
          <div v-else class="space-y-1.5">
            <div
              v-for="s in slots"
              :key="s.id"
              class="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-2"
              :class="s.status === 'cancelled' ? 'opacity-50' : ''"
            >
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
        </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
