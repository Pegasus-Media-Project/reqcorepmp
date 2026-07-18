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
          Define bookable times. Invited candidates pick an open slot first-come. Times are in your local timezone ({{ localTz }}).
        </p>

        <!-- Create form -->
        <div class="rounded-xl border border-surface-200 dark:border-surface-800 p-3 mb-4 shrink-0">
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
        <div class="flex-1 overflow-y-auto -mx-1 px-1">
          <div v-if="loading" class="flex items-center justify-center py-8 text-surface-400">
            <Loader2 class="size-5 animate-spin" />
          </div>
          <div v-else-if="!slots.length" class="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
            No slots yet. Add one above.
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="s in slots"
              :key="s.id"
              class="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-2"
              :class="s.status === 'cancelled' ? 'opacity-50' : ''"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{{ s.title }}</div>
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
  </Teleport>
</template>
