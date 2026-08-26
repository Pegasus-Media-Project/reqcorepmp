<script setup lang="ts">
import {
  CalendarClock, CalendarPlus, Check, Clock, MapPin,
  Plus, Save, Trash2, UserRound, Users, AlertCircle, Video, Phone,
  Building2, Code2, FileText, UsersRound,
} from 'lucide-vue-next'

/**
 * Reviewer interviewer-signup panel: upcoming slots with Join/Withdraw and the
 * per-job availability editor. Standalone it offers a job selector; pass
 * `jobId` to pin it to one job (used by the job's Interviews tab).
 */
const props = defineProps<{ jobId?: string }>()

const toast = useToast()

// ─── Data ────────────────────────────────────────────────────────
const selectedJobId = ref<string | undefined>(props.jobId)
watch(() => props.jobId, (id) => { if (id) selectedJobId.value = id })

const { jobs, slots, availability, status: fetchStatus, joinSlot, leaveSlot, saveAvailability }
  = useReviewerSignup(() => selectedJobId.value)

const TYPE_ICONS: Record<string, any> = {
  video: Video, phone: Phone, in_person: Building2,
  technical: Code2, take_home: FileText, panel: UsersRound,
}

// Slots grouped by calendar day (viewer-local).
const slotsByDay = computed(() => {
  const groups = new Map<string, typeof slots.value>()
  for (const s of slots.value) {
    const day = new Date(s.startsAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
    const list = groups.get(day) ?? []
    list.push(s)
    groups.set(day, list)
  }
  return [...groups.entries()]
})

function slotTime(s: { startsAt: string, duration: number }): string {
  const start = new Date(s.startsAt)
  const end = new Date(start.getTime() + s.duration * 60_000)
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${fmt(start)} – ${fmt(end)}`
}

// ─── Join / leave individual slots ───────────────────────────────
const busySlotId = ref<string | null>(null)

async function toggleSignup(slot: { id: string, signedUp: boolean }) {
  busySlotId.value = slot.id
  try {
    if (slot.signedUp) {
      await leaveSlot(slot.id)
      toast.success('You withdrew from this interview slot')
    }
    else {
      await joinSlot(slot.id)
      toast.success('You\'re signed up for this interview slot')
    }
  }
  catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Something went wrong')
  }
  finally {
    busySlotId.value = null
  }
}

// ─── Availability editor (per selected job) ──────────────────────
interface RangeDraft { date: string, from: string, to: string }
const rangeDrafts = ref<RangeDraft[]>([])
const availabilityDirty = ref(false)
const savingAvailability = ref(false)

/** Existing ranges for the selected job → editable drafts (viewer-local). */
watch([availability, selectedJobId], () => {
  if (!selectedJobId.value) {
    rangeDrafts.value = []
    availabilityDirty.value = false
    return
  }
  rangeDrafts.value = availability.value
    .filter(a => a.jobId === selectedJobId.value)
    .map((a) => {
      const start = new Date(a.startsAt)
      const end = new Date(a.endsAt)
      const pad = (n: number) => String(n).padStart(2, '0')
      return {
        date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        from: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        to: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      }
    })
  availabilityDirty.value = false
}, { immediate: true })

function addRange() {
  const pad = (n: number) => String(n).padStart(2, '0')
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  rangeDrafts.value.push({
    date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    from: '09:00',
    to: '17:00',
  })
  availabilityDirty.value = true
}

function removeRange(idx: number) {
  rangeDrafts.value.splice(idx, 1)
  availabilityDirty.value = true
}

const draftsValid = computed(() =>
  rangeDrafts.value.every(r => r.date && r.from && r.to && r.from < r.to),
)

async function handleSaveAvailability() {
  if (!selectedJobId.value || !draftsValid.value) return
  savingAvailability.value = true
  try {
    const ranges = rangeDrafts.value.map(r => ({
      startsAt: new Date(`${r.date}T${r.from}`).toISOString(),
      endsAt: new Date(`${r.date}T${r.to}`).toISOString(),
    }))
    const res = await saveAvailability(selectedJobId.value, ranges)
    availabilityDirty.value = false
    toast.success(
      res && typeof res === 'object' && 'assignedSlots' in res
        ? `Availability saved — you're assigned to ${(res as any).assignedSlots} upcoming slot${(res as any).assignedSlots === 1 ? '' : 's'}`
        : 'Availability saved',
    )
  }
  catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Failed to save availability')
  }
  finally {
    savingAvailability.value = false
  }
}
</script>

<template>
  <div>
    <!-- Job filter (hidden when pinned to one job) -->
    <div v-if="!props.jobId" class="mb-6 flex flex-wrap items-center gap-3">
      <label for="signup-job" class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
        Job
      </label>
      <select
        id="signup-job"
        v-model="selectedJobId"
        class="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3.5 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
      >
        <option :value="undefined">All jobs</option>
        <option v-for="j in jobs" :key="j.id" :value="j.id">{{ j.title }}</option>
      </select>
    </div>

    <!-- Availability editor (needs a specific job) -->
    <section class="mb-10 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5">
      <div class="flex items-center justify-between gap-3 mb-1">
        <div class="flex items-center gap-2">
          <CalendarPlus class="size-4 text-brand-500" />
          <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
            My Availability
          </h2>
        </div>
        <button
          v-if="selectedJobId"
          :disabled="!availabilityDirty || !draftsValid || savingAvailability"
          class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          @click="handleSaveAvailability"
        >
          <Save class="size-3.5" />
          {{ savingAvailability ? 'Saving…' : 'Save Availability' }}
        </button>
      </div>
      <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">
        Blocks of time you can interview in. You'll be assigned automatically to every slot that fits inside a block — including slots added later. Withdrawing a block removes those automatic assignments (slots you joined by hand stay).
      </p>

      <div v-if="!selectedJobId" class="rounded-lg border border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/40 p-4 text-sm text-surface-500 dark:text-surface-400">
        Select a job above to set your availability for it.
      </div>

      <template v-else>
        <div v-if="rangeDrafts.length === 0" class="rounded-lg border border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/40 p-4 text-sm text-surface-500 dark:text-surface-400 mb-3">
          No availability set for this job yet.
        </div>

        <div v-else class="space-y-2 mb-3">
          <div
            v-for="(r, idx) in rangeDrafts"
            :key="idx"
            class="flex flex-wrap items-center gap-2"
          >
            <input
              v-model="r.date"
              type="date"
              class="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              @change="availabilityDirty = true"
            />
            <input
              v-model="r.from"
              type="time"
              class="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              @change="availabilityDirty = true"
            />
            <span class="text-xs text-surface-400">to</span>
            <input
              v-model="r.to"
              type="time"
              class="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              @change="availabilityDirty = true"
            />
            <span v-if="r.from && r.to && r.from >= r.to" class="inline-flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
              <AlertCircle class="size-3.5" /> End must be after start
            </span>
            <button
              class="cursor-pointer rounded-lg p-2 text-surface-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:text-danger-400 dark:hover:bg-danger-950/40 transition-all"
              title="Remove this block"
              @click="removeRange(idx)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>

        <button
          class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-all"
          @click="addRange"
        >
          <Plus class="size-3.5" />
          Add a time block
        </button>
      </template>
    </section>

    <!-- Slots list -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <Clock class="size-4 text-surface-400" />
        <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
          Upcoming Interview Slots
        </h2>
        <span
          v-if="slots.length"
          class="ml-1 inline-flex items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[11px] font-semibold text-surface-500 dark:text-surface-400"
        >
          {{ slots.length }}
        </span>
      </div>

      <!-- Loading -->
      <div v-if="fetchStatus === 'pending'" class="flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-8 justify-center">
        <div class="size-5 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin" />
        <span class="text-sm text-surface-400">Loading slots…</span>
      </div>

      <!-- Empty -->
      <div
        v-else-if="slots.length === 0"
        class="rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50 p-10 text-center"
      >
        <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800">
          <CalendarClock class="size-5 text-surface-400" />
        </div>
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">
          No upcoming slots
        </h3>
        <p class="text-xs text-surface-400 dark:text-surface-500 max-w-sm mx-auto">
          There are no upcoming interview slots for {{ selectedJobId ? 'this job' : 'your jobs' }} yet. Slots appear here as soon as they're scheduled.
        </p>
      </div>

      <!-- Grouped by day -->
      <div v-else class="space-y-6">
        <div v-for="[day, daySlots] in slotsByDay" :key="day">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500 mb-2">
            {{ day }}
          </h3>
          <div class="space-y-2">
            <div
              v-for="s in daySlots"
              :key="s.id"
              class="rounded-xl border bg-white dark:bg-surface-900 p-4 transition-all"
              :class="s.signedUp
                ? 'border-brand-300 dark:border-brand-800 shadow-sm shadow-brand-500/5'
                : 'border-surface-200 dark:border-surface-800'"
            >
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div class="flex items-center gap-2 min-w-32">
                  <component :is="TYPE_ICONS[s.type] ?? Clock" class="size-4 text-brand-500 dark:text-brand-400 shrink-0" />
                  <span class="text-sm font-semibold text-surface-800 dark:text-surface-200 tabular-nums">
                    {{ slotTime(s) }}
                  </span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                    {{ s.title }}
                    <span v-if="!selectedJobId" class="text-surface-400 dark:text-surface-500 font-normal"> — {{ s.jobTitle }}</span>
                  </p>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-surface-400 dark:text-surface-500">
                    <span class="inline-flex items-center gap-1">
                      <UserRound class="size-3" />
                      {{ s.bookedCount > 0 ? `${s.bookedCount}/${s.capacity} candidate${s.capacity === 1 ? '' : 's'} booked` : 'No candidate booked yet' }}
                    </span>
                    <span v-if="s.location" class="inline-flex items-center gap-1 truncate max-w-56">
                      <MapPin class="size-3 shrink-0" />
                      {{ s.location }}
                    </span>
                  </div>
                </div>
                <button
                  :disabled="busySlotId === s.id"
                  class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  :class="s.signedUp
                    ? 'border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800'
                    : 'bg-brand-600 text-white hover:bg-brand-700'"
                  @click="toggleSignup(s)"
                >
                  <template v-if="s.signedUp">
                    <Check class="size-3.5" />
                    {{ busySlotId === s.id ? 'Withdrawing…' : (s.signupSource === 'availability' ? 'Assigned · Withdraw' : 'Signed up · Withdraw') }}
                  </template>
                  <template v-else>
                    <Plus class="size-3.5" />
                    {{ busySlotId === s.id ? 'Joining…' : 'Join' }}
                  </template>
                </button>
              </div>

              <!-- Interviewers on this slot -->
              <div
                v-if="s.reviewers.length || s.manualInterviewers.length"
                class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-surface-100 dark:border-surface-800 pt-3"
              >
                <Users class="size-3.5 text-surface-400" />
                <span
                  v-for="r in s.reviewers"
                  :key="r.userId"
                  class="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300"
                >
                  {{ r.name }}
                </span>
                <span
                  v-for="name in s.manualInterviewers"
                  :key="name"
                  class="inline-flex items-center rounded-md bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[11px] font-medium text-surface-500 dark:text-surface-400"
                >
                  {{ name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
