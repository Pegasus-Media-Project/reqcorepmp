<script setup lang="ts">
/**
 * Settings → Employment Types
 *
 * Manage the org-configurable list of employment types shown in the job form's
 * picker. A job stores the chosen label directly, so renaming/removing a type
 * here never rewrites existing jobs — it only changes what's offered next time.
 */
import { Briefcase, Plus, Loader2, Pencil, Trash2, Check, X } from 'lucide-vue-next'

definePageMeta({})

const { t } = useI18n()
useSeoMeta({
  title: () => 'Employment Types — Pegasus Media Project',
  description: () => 'Manage the employment types offered on your job postings.',
})

const { allowed: canManage } = usePermission({ organization: ['update'] })
const toast = useToast()
const {
  employmentTypes, refresh, status,
  createEmploymentType, updateEmploymentType, deleteEmploymentType,
} = useEmploymentTypes()

const isLoading = computed(() => status.value === 'pending' && employmentTypes.value.length === 0)

// ── Add ──
const newLabel = ref('')
const isAdding = ref(false)
async function addType() {
  const label = newLabel.value.trim()
  if (!label) return
  isAdding.value = true
  try {
    await createEmploymentType({ label })
    newLabel.value = ''
    await refresh()
  }
  catch (err: any) {
    toast.error('Could not add employment type', { message: err?.data?.statusMessage })
  }
  finally {
    isAdding.value = false
  }
}

// ── Rename (inline) ──
const editingId = ref<string | null>(null)
const editLabel = ref('')
function startEdit(row: { id: string, label: string }) {
  editingId.value = row.id
  editLabel.value = row.label
}
function cancelEdit() {
  editingId.value = null
  editLabel.value = ''
}
async function saveEdit(id: string) {
  const label = editLabel.value.trim()
  if (!label) return
  try {
    await updateEmploymentType(id, { label })
    cancelEdit()
    await refresh()
  }
  catch (err: any) {
    toast.error('Could not rename employment type', { message: err?.data?.statusMessage })
  }
}

// ── Delete ──
const deletingId = ref<string | null>(null)
async function removeType(row: { id: string, label: string }) {
  if (!confirm(`Remove "${row.label}" from the employment-type list? Existing jobs keep their current type.`)) return
  deletingId.value = row.id
  try {
    await deleteEmploymentType(row.id)
    await refresh()
  }
  catch (err: any) {
    toast.error('Could not remove employment type', { message: err?.data?.statusMessage })
  }
  finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Employment Types</h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        These options populate the employment-type picker when creating or editing a job.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center gap-2 text-sm text-surface-400 py-8">
      <Loader2 class="size-4 animate-spin" /> Loading…
    </div>

    <template v-else>
      <!-- Add row -->
      <form v-if="canManage" class="mb-4 flex items-center gap-2" @submit.prevent="addType">
        <input
          v-model="newLabel"
          type="text"
          maxlength="60"
          placeholder="Add an employment type (e.g. Freelance)"
          class="w-full max-w-xs rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
        />
        <button
          type="submit"
          :disabled="isAdding || !newLabel.trim()"
          class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          <Loader2 v-if="isAdding" class="size-4 animate-spin" />
          <Plus v-else class="size-4" />
          Add
        </button>
      </form>

      <!-- List -->
      <ul class="rounded-xl border border-surface-200 dark:border-surface-800 divide-y divide-surface-100 dark:divide-surface-800 bg-white dark:bg-surface-900">
        <li v-if="employmentTypes.length === 0" class="px-4 py-6 text-sm text-surface-400 text-center">
          No employment types yet. Add one above.
        </li>
        <li v-for="row in employmentTypes" :key="row.id" class="flex items-center gap-3 px-4 py-3">
          <Briefcase class="size-4 shrink-0 text-surface-400" />

          <!-- Editing -->
          <template v-if="editingId === row.id">
            <input
              v-model="editLabel"
              type="text"
              maxlength="60"
              class="flex-1 rounded-lg border border-surface-300 dark:border-surface-700 px-2.5 py-1.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              @keyup.enter="saveEdit(row.id)"
              @keyup.esc="cancelEdit"
            />
            <button type="button" class="text-success-600 hover:text-success-700 p-1" @click="saveEdit(row.id)">
              <Check class="size-4" />
            </button>
            <button type="button" class="text-surface-400 hover:text-surface-600 p-1" @click="cancelEdit">
              <X class="size-4" />
            </button>
          </template>

          <!-- Display -->
          <template v-else>
            <span class="flex-1 text-sm text-surface-900 dark:text-surface-100">{{ row.label }}</span>
            <template v-if="canManage">
              <button type="button" class="text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 p-1" @click="startEdit(row)">
                <Pencil class="size-4" />
              </button>
              <button
                type="button"
                :disabled="deletingId === row.id"
                class="text-surface-400 hover:text-danger-500 p-1 disabled:opacity-50"
                @click="removeType(row)"
              >
                <Loader2 v-if="deletingId === row.id" class="size-4 animate-spin" />
                <Trash2 v-else class="size-4" />
              </button>
            </template>
          </template>
        </li>
      </ul>

      <p v-if="!canManage" class="mt-3 text-xs text-surface-400">
        Only admins and owners can change employment types.
      </p>
    </template>
  </div>
</template>
