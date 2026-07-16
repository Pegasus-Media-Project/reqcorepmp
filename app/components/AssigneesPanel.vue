<script setup lang="ts">
/**
 * Reusable "who can manage this" panel.
 *
 * Lists the users assigned to a program or a single job and lets an admin/owner
 * add or remove org members. Backed by simple REST endpoints supplied via props:
 *   GET    listUrl                 → [{ userId, user: { id, name, email, image } }]
 *   POST   listUrl { userId }      → assign
 *   DELETE `${listUrl}/${userId}`  → unassign
 */
import { Loader2, Plus, X, Users } from 'lucide-vue-next'

const props = defineProps<{
  /** Base endpoint, e.g. `/api/programs/abc/members` or `/api/jobs/abc/access` */
  listUrl: string
  title: string
  description: string
  canManage: boolean
}>()

interface Assignee {
  userId: string
  user: { id: string, name: string, email: string, image?: string | null }
}
interface OrgMember {
  userId: string
  role: string
  user: { name: string, email: string, image?: string | null }
}

const { t } = useI18n()
const toast = useToast()

const assignees = ref<Assignee[]>([])
const orgMembers = ref<OrgMember[]>([])
const isLoading = ref(true)
const busyUserId = ref<string | null>(null)
const selectedUserId = ref('')

const assignedIds = computed(() => new Set(assignees.value.map(a => a.userId)))
const assignableMembers = computed(() =>
  orgMembers.value.filter(m => !assignedIds.value.has(m.userId)),
)

async function loadAssignees() {
  assignees.value = await $fetch<Assignee[]>(props.listUrl)
}

async function loadMembers() {
  const result = await authClient.organization.listMembers()
  if (result.error) throw new Error(String(result.error.message ?? 'Failed to load members'))
  orgMembers.value = (result.data?.members ?? []) as OrgMember[]
}

async function refreshAll() {
  isLoading.value = true
  try {
    await Promise.all([loadAssignees(), props.canManage ? loadMembers() : Promise.resolve()])
  }
  catch {
    toast.error(t('programs.assignments.addFailed'))
  }
  finally {
    isLoading.value = false
  }
}

onMounted(refreshAll)

async function addAssignee() {
  const userId = selectedUserId.value
  if (!userId) return
  busyUserId.value = userId
  try {
    await $fetch(props.listUrl, { method: 'POST', body: { userId } })
    selectedUserId.value = ''
    await loadAssignees()
  }
  catch (err: any) {
    toast.error(t('programs.assignments.addFailed'), { message: err?.data?.statusMessage })
  }
  finally {
    busyUserId.value = null
  }
}

async function removeAssignee(userId: string) {
  busyUserId.value = userId
  try {
    await $fetch(`${props.listUrl}/${userId}`, { method: 'DELETE' })
    await loadAssignees()
  }
  catch (err: any) {
    toast.error(t('programs.assignments.addFailed'), { message: err?.data?.statusMessage })
  }
  finally {
    busyUserId.value = null
  }
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
    <div class="px-4 sm:px-5 py-4 border-b border-surface-200 dark:border-surface-800">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center size-8 shrink-0 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
          <Users class="size-4" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ title }}</h2>
          <p class="text-xs text-surface-500 dark:text-surface-400">{{ description }}</p>
        </div>
      </div>
    </div>

    <!-- Add picker -->
    <div v-if="canManage" class="px-4 sm:px-5 py-3 border-b border-surface-100 dark:border-surface-800 flex items-center gap-2">
      <div class="relative flex-1">
        <select
          v-model="selectedUserId"
          class="w-full appearance-none rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors cursor-pointer"
        >
          <option value="">{{ t('programs.assignments.addPlaceholder') }}</option>
          <option v-for="m in assignableMembers" :key="m.userId" :value="m.userId">
            {{ m.user.name }} — {{ m.user.email }}
          </option>
        </select>
      </div>
      <button
        :disabled="!selectedUserId || busyUserId === selectedUserId"
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        @click="addAssignee"
      >
        <Loader2 v-if="busyUserId === selectedUserId" class="size-4 animate-spin" />
        <Plus v-else class="size-4" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="px-4 sm:px-5 py-6 text-center text-surface-400 text-sm">
      <Loader2 class="size-4 animate-spin mx-auto mb-1.5" />
    </div>

    <!-- Empty -->
    <div v-else-if="assignees.length === 0" class="px-4 sm:px-5 py-6 text-center text-sm text-surface-400 dark:text-surface-500">
      {{ t('programs.assignments.empty') }}
    </div>

    <!-- List -->
    <ul v-else class="divide-y divide-surface-100 dark:divide-surface-800">
      <li
        v-for="a in assignees"
        :key="a.userId"
        class="px-4 sm:px-5 py-3 flex items-center gap-3"
      >
        <img
          v-if="a.user.image"
          :src="a.user.image"
          :alt="a.user.name"
          class="size-8 rounded-full object-cover ring-2 ring-surface-100 dark:ring-surface-800"
        />
        <div v-else class="size-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300 ring-2 ring-surface-100 dark:ring-surface-800">
          {{ getInitials(a.user.name) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{{ a.user.name }}</div>
          <div class="text-xs text-surface-500 dark:text-surface-400 truncate">{{ a.user.email }}</div>
        </div>
        <button
          v-if="canManage"
          :disabled="busyUserId === a.userId"
          class="inline-flex items-center gap-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="t('programs.assignments.remove')"
          @click="removeAssignee(a.userId)"
        >
          <Loader2 v-if="busyUserId === a.userId" class="size-3.5 animate-spin" />
          <X v-else class="size-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
