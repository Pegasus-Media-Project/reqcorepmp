<script setup lang="ts">
import { X, Check, UserPlus, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  interviewIds: string[]
  /** Distinct job ids the selected interviews belong to (for the reviewer pool). */
  jobIds: string[]
}>()

const emit = defineEmits<{ close: []; assigned: [] }>()

const toast = useToast()

interface Reviewer {
  userId: string
  name: string | null
  email: string
  image: string | null
  role: string
  isGuest: boolean
}

const pool = ref<Reviewer[]>([])
const selected = ref<Set<string>>(new Set())
const loading = ref(false)
const submitting = ref(false)

async function loadPool() {
  loading.value = true
  pool.value = []
  selected.value = new Set()
  try {
    const byId = new Map<string, Reviewer>()
    for (const jobId of props.jobIds) {
      const res = await $fetch<{ data: Reviewer[] }>(`/api/jobs/${jobId}/reviewers`)
      for (const r of res.data) byId.set(r.userId, r)
    }
    pool.value = [...byId.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
  }
  catch (err: any) {
    toast.error('Failed to load reviewers', { message: err?.data?.statusMessage })
  }
  finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) loadPool()
})

function toggle(userId: string) {
  const next = new Set(selected.value)
  next.has(userId) ? next.delete(userId) : next.add(userId)
  selected.value = next
}

const interviewCount = computed(() => props.interviewIds.length)

async function submit() {
  if (selected.value.size === 0) return
  submitting.value = true
  try {
    const { results } = await $fetch<{ results: { status: string }[] }>('/api/interviews/assign-reviewers', {
      method: 'POST',
      body: { userIds: [...selected.value], interviewIds: props.interviewIds },
    })
    const calendar = results.filter(r => r.status === 'calendar').length
    const emailed = results.filter(r => r.status === 'email').length
    const failed = results.filter(r => r.status === 'failed').length
    const parts = [
      calendar ? `${calendar} calendar invite${calendar === 1 ? '' : 's'}` : '',
      emailed ? `${emailed} emailed` : '',
      failed ? `${failed} failed` : '',
    ].filter(Boolean)
    if (failed) {
      toast.warning('Reviewers assigned', parts.join(', '))
    }
    else {
      toast.success('Reviewers assigned', parts.join(', ') || 'Done')
    }
    emit('assigned')
    emit('close')
  }
  catch (err: any) {
    toast.error('Failed to assign reviewers', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
      <div class="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-surface-900 shadow-2xl ring-1 ring-surface-200/80 dark:ring-surface-700/60 p-5">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <UserPlus class="size-4" /> Assign reviewers
          </h3>
          <button class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          They'll be added to {{ interviewCount }} interview{{ interviewCount === 1 ? '' : 's' }} and sent a calendar invite.
        </p>

        <div v-if="loading" class="flex items-center justify-center py-8 text-surface-400">
          <Loader2 class="size-5 animate-spin" />
        </div>

        <div v-else-if="pool.length === 0" class="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
          No assignable reviewers. Assign members or guests to the job first.
        </div>

        <div v-else class="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
          <label
            v-for="r in pool"
            :key="r.userId"
            class="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/60"
          >
            <input type="checkbox" class="sr-only" :checked="selected.has(r.userId)" @change="toggle(r.userId)">
            <span
              class="size-4 shrink-0 rounded border flex items-center justify-center transition-colors"
              :class="selected.has(r.userId) ? 'bg-brand-600 border-brand-600 text-white' : 'border-surface-300 dark:border-surface-600'"
            >
              <Check v-if="selected.has(r.userId)" class="size-3" />
            </span>
            <img v-if="r.image" :src="r.image" class="size-7 rounded-full" :alt="r.name ?? r.email">
            <span v-else class="size-7 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs font-medium text-surface-500 dark:text-surface-300">
              {{ (r.name ?? r.email).charAt(0).toUpperCase() }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-surface-800 dark:text-surface-200">{{ r.name ?? r.email }}</span>
              <span class="block truncate text-xs text-surface-400">{{ r.email }}</span>
            </span>
            <span v-if="r.isGuest" class="shrink-0 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium">Guest</span>
          </label>
        </div>

        <div class="flex justify-end gap-2 mt-5">
          <button
            class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            :disabled="selected.size === 0 || submitting"
            class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="submit"
          >
            <Loader2 v-if="submitting" class="size-3.5 animate-spin" />
            Assign {{ selected.size || '' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
