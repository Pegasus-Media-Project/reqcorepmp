<script setup lang="ts">
import { UserPlus, Mail, X, Loader2, ChevronDown, Trash2, Check } from 'lucide-vue-next'

interface GuestMember {
  userId: string
  role: string
  user: { name?: string; email: string; image?: string }
}
interface PendingInvite { id: string; email: string; role: string }

const props = defineProps<{
  guests: GuestMember[]
  pending: PendingInvite[]
}>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()

// Jobs for the multiselect / per-guest editor.
const { data: jobsData } = useFetch<{ data: { id: string; title: string }[] }>('/api/jobs', {
  key: 'guest-mgmt-jobs',
  query: { limit: 200 },
  headers: useRequestHeaders(['cookie']),
})
const jobs = computed(() => jobsData.value?.data ?? [])

// ── Invite ──
const email = ref('')
const inviteJobIds = ref<Set<string>>(new Set())
const inviting = ref(false)
const showInvite = ref(false)

function toggleInviteJob(id: string) {
  const next = new Set(inviteJobIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  inviteJobIds.value = next
}

async function invite() {
  if (!email.value.trim() || inviteJobIds.value.size === 0) return
  inviting.value = true
  try {
    const res = await $fetch<{ assigned?: boolean; invited?: boolean }>('/api/guests', {
      method: 'POST',
      body: { email: email.value.trim(), jobIds: [...inviteJobIds.value] },
    })
    toast.success(res.assigned ? 'Guest assigned' : 'Invitation sent', res.assigned
      ? 'They already had an account and now have access to the selected jobs.'
      : `Invited ${email.value.trim()} to ${inviteJobIds.value.size} job(s).`)
    email.value = ''
    inviteJobIds.value = new Set()
    showInvite.value = false
    emit('changed')
  }
  catch (err: any) {
    toast.error('Failed to invite guest', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    inviting.value = false
  }
}

// ── Per-guest job editor ──
const editingUserId = ref<string | null>(null)
const editorJobIds = ref<Set<string>>(new Set())
const editorBusy = ref<string | null>(null)

async function openEditor(g: GuestMember) {
  if (editingUserId.value === g.userId) {
    editingUserId.value = null
    return
  }
  editingUserId.value = g.userId
  editorJobIds.value = new Set()
  try {
    const res = await $fetch<{ assignedJobIds: string[] }>(`/api/guests/${g.userId}/jobs`)
    editorJobIds.value = new Set(res.assignedJobIds)
  }
  catch (err: any) {
    toast.error('Failed to load job access', { message: err?.data?.statusMessage })
  }
}

async function toggleGuestJob(g: GuestMember, jobId: string) {
  const has = editorJobIds.value.has(jobId)
  editorBusy.value = jobId
  try {
    if (has) {
      await $fetch(`/api/jobs/${jobId}/guests/${g.userId}`, { method: 'DELETE' })
      editorJobIds.value.delete(jobId)
    }
    else {
      await $fetch(`/api/jobs/${jobId}/guests`, { method: 'POST', body: { email: g.user.email } })
      editorJobIds.value.add(jobId)
    }
    editorJobIds.value = new Set(editorJobIds.value)
    emit('changed')
  }
  catch (err: any) {
    toast.error('Failed to update job access', { message: err?.data?.statusMessage })
  }
  finally {
    editorBusy.value = null
  }
}

async function removeGuest(g: GuestMember) {
  try {
    await $fetch(`/api/guests/${g.userId}`, { method: 'DELETE' })
    if (editingUserId.value === g.userId) editingUserId.value = null
    emit('changed')
  }
  catch (err: any) {
    toast.error('Failed to remove guest', { message: err?.data?.statusMessage })
  }
}

async function cancelInvite(id: string) {
  try {
    await $fetch(`/api/guests/invitations/${id}`, { method: 'DELETE' })
    emit('changed')
  }
  catch (err: any) {
    toast.error('Failed to cancel invitation', { message: err?.data?.statusMessage })
  }
}
</script>

<template>
  <section class="mb-8">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Guest reviewers</h2>
        <p class="text-xs text-surface-500 dark:text-surface-400">External reviewers with access only to the jobs you assign — no other org access.</p>
      </div>
      <button
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        @click="showInvite = !showInvite"
      >
        <UserPlus class="size-4" /> Invite guest
      </button>
    </div>

    <!-- Invite form -->
    <div v-if="showInvite" class="mb-4 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4">
      <div class="relative max-w-sm mb-3">
        <Mail class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
        <input
          v-model="email"
          type="email"
          placeholder="reviewer@example.com"
          class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 py-2 pl-10 pr-3 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        >
      </div>
      <p class="text-xs font-medium text-surface-500 dark:text-surface-400 mb-2">Jobs they can review</p>
      <div class="max-h-48 overflow-y-auto space-y-1 mb-3">
        <label v-for="j in jobs" :key="j.id" class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/60">
          <input type="checkbox" class="sr-only" :checked="inviteJobIds.has(j.id)" @change="toggleInviteJob(j.id)">
          <span class="size-4 shrink-0 rounded border flex items-center justify-center" :class="inviteJobIds.has(j.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-surface-300 dark:border-surface-600'">
            <Check v-if="inviteJobIds.has(j.id)" class="size-3" />
          </span>
          <span class="text-sm text-surface-700 dark:text-surface-200 truncate">{{ j.title }}</span>
        </label>
      </div>
      <div class="flex justify-end">
        <button
          :disabled="inviting || !email.trim() || inviteJobIds.size === 0"
          class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
          @click="invite"
        >
          <Loader2 v-if="inviting" class="size-4 animate-spin" />
          Send invite
        </button>
      </div>
    </div>

    <!-- Active guests -->
    <ul v-if="guests.length" class="space-y-2 mb-4">
      <li v-for="g in guests" :key="g.userId" class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <div class="flex items-center gap-3 px-3 py-2.5">
          <img v-if="g.user.image" :src="g.user.image" class="size-8 rounded-full" :alt="g.user.name ?? g.user.email">
          <span v-else class="size-8 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs font-medium text-surface-500 dark:text-surface-300">
            {{ (g.user.name ?? g.user.email).charAt(0).toUpperCase() }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-surface-800 dark:text-surface-200">{{ g.user.name ?? g.user.email }}</span>
            <span class="block truncate text-xs text-surface-400">{{ g.user.email }}</span>
          </span>
          <span class="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 px-2 py-0.5 text-[10px] font-medium">Guest</span>
          <button
            class="inline-flex items-center gap-1 rounded-lg border border-surface-200 dark:border-surface-700 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
            @click="openEditor(g)"
          >
            Jobs <ChevronDown class="size-3.5 transition-transform" :class="editingUserId === g.userId ? 'rotate-180' : ''" />
          </button>
          <button
            class="text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 transition-colors"
            title="Remove guest"
            @click="removeGuest(g)"
          >
            <Trash2 class="size-4" />
          </button>
        </div>
        <!-- Job editor -->
        <div v-if="editingUserId === g.userId" class="border-t border-surface-100 dark:border-surface-800 p-3">
          <p class="text-xs font-medium text-surface-500 dark:text-surface-400 mb-2">Job access</p>
          <div class="max-h-48 overflow-y-auto space-y-1">
            <label v-for="j in jobs" :key="j.id" class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/60">
              <input type="checkbox" class="sr-only" :checked="editorJobIds.has(j.id)" :disabled="editorBusy === j.id" @change="toggleGuestJob(g, j.id)">
              <span class="size-4 shrink-0 rounded border flex items-center justify-center" :class="editorJobIds.has(j.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-surface-300 dark:border-surface-600'">
                <Loader2 v-if="editorBusy === j.id" class="size-3 animate-spin" />
                <Check v-else-if="editorJobIds.has(j.id)" class="size-3" />
              </span>
              <span class="text-sm text-surface-700 dark:text-surface-200 truncate">{{ j.title }}</span>
            </label>
          </div>
        </div>
      </li>
    </ul>

    <!-- Pending guest invitations -->
    <div v-if="pending.length">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500 mb-2">Pending guest invitations</p>
      <ul class="space-y-2">
        <li v-for="p in pending" :key="p.id" class="flex items-center gap-3 rounded-lg border border-dashed border-surface-200 dark:border-surface-800 px-3 py-2">
          <Mail class="size-4 text-surface-400" />
          <span class="min-w-0 flex-1 truncate text-sm text-surface-600 dark:text-surface-300">{{ p.email }}</span>
          <span class="rounded-full bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400">Pending</span>
          <button class="text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 transition-colors" title="Cancel invitation" @click="cancelInvite(p.id)">
            <X class="size-4" />
          </button>
        </li>
      </ul>
    </div>

    <p v-if="!guests.length && !pending.length" class="text-sm text-surface-400 italic">No guest reviewers yet.</p>
  </section>
</template>
