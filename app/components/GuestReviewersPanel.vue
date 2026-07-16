<script setup lang="ts">
import { UserPlus, Mail, X, Loader2 } from 'lucide-vue-next'

const props = defineProps<{ jobId: string }>()

const toast = useToast()

interface GuestRow { userId: string; name: string | null; email: string; image: string | null }
interface PendingRow { email: string; createdAt: string }

const { data, refresh, status } = useFetch<{ active: GuestRow[]; pending: PendingRow[] }>(
  () => `/api/jobs/${props.jobId}/guests`,
  { key: `job-guests-${props.jobId}`, headers: useRequestHeaders(['cookie']) },
)

const active = computed(() => data.value?.active ?? [])
const pending = computed(() => data.value?.pending ?? [])

const email = ref('')
const inviting = ref(false)

async function invite() {
  const trimmed = email.value.trim()
  if (!trimmed) return
  inviting.value = true
  try {
    const res = await $fetch<{ assigned?: boolean; invited?: boolean }>(`/api/jobs/${props.jobId}/guests`, {
      method: 'POST',
      body: { email: trimmed },
    })
    toast.success(res.assigned ? 'Guest assigned' : 'Invitation sent', res.assigned ? 'They already had an account and now have access to this job.' : `Invited ${trimmed} as a guest reviewer.`)
    email.value = ''
    await refresh()
  }
  catch (err: any) {
    toast.error('Failed to invite guest', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
  finally {
    inviting.value = false
  }
}

async function revoke(userId: string) {
  try {
    await $fetch(`/api/jobs/${props.jobId}/guests/${userId}`, { method: 'DELETE' })
    await refresh()
  }
  catch (err: any) {
    toast.error('Failed to revoke access', { message: err?.data?.statusMessage })
  }
}
</script>

<template>
  <div>
    <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Guest reviewers</h2>
    <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
      External reviewers who can only see and rate applicants for this job. They have no other access to your organization.
    </p>

    <!-- Invite form -->
    <form class="flex items-center gap-2 mb-5" @submit.prevent="invite">
      <div class="relative flex-1 max-w-sm">
        <Mail class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
        <input
          v-model="email"
          type="email"
          required
          placeholder="reviewer@example.com"
          class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 py-2 pl-10 pr-3 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        >
      </div>
      <button
        type="submit"
        :disabled="inviting || !email.trim()"
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="inviting" class="size-4 animate-spin" />
        <UserPlus v-else class="size-4" />
        Invite
      </button>
    </form>

    <div v-if="status === 'pending'" class="text-sm text-surface-400">Loading…</div>

    <template v-else>
      <!-- Active guests -->
      <ul v-if="active.length" class="space-y-2 mb-4">
        <li
          v-for="g in active"
          :key="g.userId"
          class="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2"
        >
          <img v-if="g.image" :src="g.image" class="size-7 rounded-full" :alt="g.name ?? g.email">
          <span v-else class="size-7 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs font-medium text-surface-500 dark:text-surface-300">
            {{ (g.name ?? g.email).charAt(0).toUpperCase() }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-surface-800 dark:text-surface-200">{{ g.name ?? g.email }}</span>
            <span class="block truncate text-xs text-surface-400">{{ g.email }}</span>
          </span>
          <span class="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 px-2 py-0.5 text-[10px] font-medium">Guest</span>
          <button
            class="text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 transition-colors"
            title="Revoke access"
            @click="revoke(g.userId)"
          >
            <X class="size-4" />
          </button>
        </li>
      </ul>

      <!-- Pending invites -->
      <div v-if="pending.length" class="space-y-2">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500">Pending invitations</p>
        <ul class="space-y-2">
          <li
            v-for="p in pending"
            :key="p.email"
            class="flex items-center gap-3 rounded-lg border border-dashed border-surface-200 dark:border-surface-800 px-3 py-2"
          >
            <Mail class="size-4 text-surface-400" />
            <span class="min-w-0 flex-1 truncate text-sm text-surface-600 dark:text-surface-300">{{ p.email }}</span>
            <span class="rounded-full bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400">Pending</span>
          </li>
        </ul>
      </div>

      <p v-if="!active.length && !pending.length" class="text-sm text-surface-400 italic">No guest reviewers yet.</p>
    </template>
  </div>
</template>
