<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

/**
 * Confirmation for removing a single application.
 *
 * Unlike deleting a candidate — which quarantines and can be undone from
 * Settings — this is permanent, so the dialog spells out what goes and what
 * stays before the button is armed. Shared by the application page, the
 * table drawer and the pipeline so the wording can't drift between them.
 */
const props = defineProps<{
  applicationId: string
  candidateName: string
  jobTitle?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ (e: 'deleted', applicationId: string): void }>()

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const deleting = ref(false)

async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, { method: 'DELETE' })
    toast.success('Application deleted')
    open.value = false
    emit('deleted', props.applicationId)
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete application', {
      message: err?.data?.statusMessage,
      statusCode: err?.data?.statusCode,
    })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="deleting || (open = false)" />
      <div class="relative mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-surface-900">
        <div class="mb-3 flex items-start gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-50 dark:bg-danger-950/60">
            <AlertTriangle class="size-4 text-danger-600 dark:text-danger-400" />
          </span>
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Delete application</h3>
            <p class="mt-1 text-sm text-surface-600 dark:text-surface-400">
              Permanently delete <strong>{{ candidateName }}</strong>'s application<template v-if="jobTitle"> for
              <strong>{{ jobTitle }}</strong></template>. This can't be undone.
            </p>
          </div>
        </div>

        <div class="mb-4 rounded-lg border border-surface-200 bg-surface-50 px-3.5 py-3 text-xs text-surface-600 dark:border-surface-800 dark:bg-surface-800/50 dark:text-surface-400">
          <p class="mb-1.5 font-medium text-surface-700 dark:text-surface-300">Deleted with it</p>
          <p>Their answers, interviews, ratings, notes and AI analysis for this application.</p>
          <p class="mb-1.5 mt-2.5 font-medium text-surface-700 dark:text-surface-300">Kept</p>
          <p>The candidate and their documents — including any other applications they've made.</p>
        </div>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            :disabled="deleting"
            class="rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
            @click="open = false"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="deleting"
            class="rounded-lg bg-danger-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
            @click="confirmDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete application' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
