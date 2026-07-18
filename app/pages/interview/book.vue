<script setup lang="ts">
definePageMeta({
  layout: 'public',
})

interface Slot {
  id: string
  title: string
  startsAt: string
  duration: number
  timezone: string
  location: string | null
  type: string
}

const route = useRoute()
const token = computed(() => {
  const t = route.query.token
  return typeof t === 'string' ? t : ''
})

const { data, error: fetchError, status: fetchStatus, refresh } = await useFetch<{
  candidateFirstName: string | null
  jobTitle: string | null
  organizationName: string | null
  alreadyBooked: { slot: Slot } | null
  slots: Slot[]
}>('/api/public/interview-slots', {
  query: { token },
  immediate: !!token.value,
})

const interviewTypeLabels: Record<string, string> = {
  video: 'Video Call',
  phone: 'Phone Call',
  in_person: 'In Person',
  technical: 'Technical Interview',
  panel: 'Panel Interview',
  take_home: 'Take-Home Assignment',
}

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

const selectedSlotId = ref<string>('')
const booking = ref(false)
const bookError = ref('')
const bookedSlot = ref<Slot | null>(null)

// Group available slots by local calendar day.
const groupedSlots = computed(() => {
  const groups = new Map<string, { label: string, slots: Slot[] }>()
  for (const s of data.value?.slots ?? []) {
    const d = new Date(s.startsAt)
    const key = d.toLocaleDateString('en-US', { timeZone: localTz })
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: localTz })
    if (!groups.has(key)) groups.set(key, { label, slots: [] })
    groups.get(key)!.slots.push(s)
  }
  return [...groups.values()]
})

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: localTz,
  })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: localTz,
  })
}

async function confirmBooking() {
  if (!token.value || !selectedSlotId.value || booking.value) return
  booking.value = true
  bookError.value = ''
  try {
    const res = await $fetch<{ success: boolean, slot: Slot }>('/api/public/interview-slots/book', {
      method: 'POST',
      body: { token: token.value, slotId: selectedSlotId.value },
    })
    bookedSlot.value = res.slot
  }
  catch (err: any) {
    const status = err?.data?.statusCode ?? err?.statusCode
    bookError.value = err?.data?.statusMessage || 'Something went wrong. Please try again.'
    // If the slot was just taken, refresh the list so it disappears.
    if (status === 409) {
      selectedSlotId.value = ''
      await refresh()
    }
  }
  finally {
    booking.value = false
  }
}

useHead({ title: 'Schedule Your Interview' })
</script>

<template>
  <div class="max-w-lg mx-auto py-12">
    <!-- No token -->
    <div v-if="!token" class="text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
        <span class="text-2xl">⚠</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">Invalid Link</h1>
      <p class="text-surface-500">This link is missing required information. Please use the link from your invitation email.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="fetchStatus === 'pending'" class="text-center py-12">
      <div class="animate-spin inline-block w-8 h-8 border-2 border-surface-300 border-t-blue-600 rounded-full mb-4" />
      <p class="text-surface-500">Loading available times…</p>
    </div>

    <!-- Error / expired -->
    <div v-else-if="fetchError" class="text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
        <span class="text-2xl">⚠</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
        {{ fetchError.statusCode === 400 ? 'Link Expired' : 'Something went wrong' }}
      </h1>
      <p class="text-surface-500">
        {{ fetchError.statusCode === 400
          ? 'This scheduling link has expired or is no longer valid. Please contact the hiring team for a new invitation.'
          : 'We couldn\'t load the available times. Please try again later.' }}
      </p>
    </div>

    <!-- Just booked -->
    <div v-else-if="bookedSlot" class="text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
        <span class="text-2xl">✓</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">You're booked!</h1>
      <p class="text-surface-500 mb-2">Your interview is confirmed for:</p>
      <p class="text-surface-900 dark:text-surface-100 font-semibold">{{ formatDateTime(bookedSlot.startsAt) }}</p>
      <p class="text-xs text-surface-400 mt-1">Times shown in your local timezone ({{ localTz }}).</p>
    </div>

    <!-- Already booked earlier -->
    <div v-else-if="data?.alreadyBooked" class="text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
        <span class="text-2xl">ℹ</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">Interview Already Scheduled</h1>
      <p class="text-surface-500 mb-2">You've already booked your interview for:</p>
      <p class="text-surface-900 dark:text-surface-100 font-semibold">{{ formatDateTime(data.alreadyBooked.slot.startsAt) }}</p>
      <p class="text-xs text-surface-400 mt-1">Need to change it? Please contact the hiring team.</p>
    </div>

    <!-- Slot picker -->
    <div v-else-if="data">
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-1 text-center">
        Schedule your interview
      </h1>
      <p class="text-sm text-surface-500 text-center mb-6">
        <template v-if="data.jobTitle">{{ data.jobTitle }}<span v-if="data.organizationName"> · {{ data.organizationName }}</span></template>
      </p>

      <!-- No slots -->
      <div v-if="!data.slots.length" class="text-center py-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 mb-4">
          <span class="text-2xl">📅</span>
        </div>
        <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">No times available</h2>
        <p class="text-surface-500">All interview times are currently taken. Please check back later or contact the hiring team.</p>
      </div>

      <template v-else>
        <div v-if="bookError" class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {{ bookError }}
        </div>

        <div class="space-y-5 mb-6">
          <div v-for="group in groupedSlots" :key="group.label">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">{{ group.label }}</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                v-for="s in group.slots"
                :key="s.id"
                type="button"
                class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                :class="selectedSlotId === s.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40'"
                @click="selectedSlotId = s.id"
              >
                {{ formatTime(s.startsAt) }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedSlotId" class="text-xs text-surface-400 text-center mb-3">
          Times shown in your local timezone ({{ localTz }}).
        </div>

        <button
          :disabled="!selectedSlotId || booking"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          @click="confirmBooking"
        >
          <span v-if="booking">Booking…</span>
          <span v-else>Confirm this time</span>
        </button>
      </template>
    </div>
  </div>
</template>
