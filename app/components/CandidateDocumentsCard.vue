<script setup lang="ts">
import { File as FileIcon, Upload, Download, Trash2 } from 'lucide-vue-next'

/**
 * Candidate documents as a page card: list + upload + download + delete.
 * Used on the application detail page so staff can attach files (a resume an
 * applicant emailed in, for example) without leaving the application. Shares
 * the `candidate-${id}` cache key with the candidate detail views, so an
 * upload here is reflected there and vice versa.
 */

const props = defineProps<{
  candidateId: string
}>()

const toast = useToast()

// Guests are read-only on documents.
const { allowed: canManageDocuments } = usePermission({ document: ['create'] })

const { data: candidateData, refresh: refreshCandidate } = useFetch<any>(
  () => `/api/candidates/${props.candidateId}`,
  { key: `candidate-${props.candidateId}` },
)
const documents = computed(() => candidateData.value?.documents ?? [])

const { uploadDocument, downloadDocument, deleteDocument } = useDocuments()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const deletingDocId = ref<string | null>(null)
const confirmDeleteDocId = ref<string | null>(null)

const documentTypeLabels: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  other: 'Other',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function triggerFileSelect() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploadError.value = null
  isUploading.value = true
  try {
    await uploadDocument(props.candidateId, file, selectedDocType.value)
    await refreshCandidate()
    toast.add({ title: 'Document uploaded', type: 'success' })
  } catch (err: any) {
    uploadError.value = err.data?.statusMessage ?? err.statusMessage ?? 'Upload failed'
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

async function handleDelete(docId: string) {
  deletingDocId.value = docId
  try {
    await deleteDocument(docId, props.candidateId)
    await refreshCandidate()
  } catch (err: any) {
    toast.error('Failed to delete document', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    deletingDocId.value = null
    confirmDeleteDocId.value = null
  }
}
</script>

<template>
  <div class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <FileIcon class="size-4 text-surface-500 dark:text-surface-400" />
        <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">
          Documents<template v-if="documents.length"> ({{ documents.length }})</template>
        </h2>
      </div>
      <div v-if="canManageDocuments" class="flex items-center gap-2">
        <select
          v-model="selectedDocType"
          class="rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="resume">Resume</option>
          <option value="cover_letter">Cover Letter</option>
          <option value="other">Other</option>
        </select>
        <button
          :disabled="isUploading"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-surface-300 dark:border-surface-600 px-3 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          @click="triggerFileSelect"
        >
          <Upload class="size-3.5" />
          {{ isUploading ? 'Uploading…' : 'Upload' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.doc,.docx"
          class="hidden"
          @change="handleFileSelected"
        >
      </div>
    </div>

    <div
      v-if="uploadError"
      class="mb-3 rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950 p-3 text-sm text-danger-700 dark:text-danger-400"
    >
      {{ uploadError }}
      <button class="underline ml-1" @click="uploadError = null">Dismiss</button>
    </div>

    <p v-if="documents.length === 0" class="text-sm text-surface-400 italic">
      No documents yet.{{ canManageDocuments ? ' Upload a resume, cover letter, or other file for this candidate.' : '' }}
    </p>

    <ul v-else class="divide-y divide-surface-100 dark:divide-surface-800">
      <li
        v-for="doc in documents"
        :key="doc.id"
        class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <div class="flex min-w-0 items-center gap-3">
          <FileIcon class="size-4 shrink-0 text-surface-400" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-surface-700 dark:text-surface-200">
              {{ doc.originalFilename }}
            </p>
            <p class="text-xs text-surface-400">
              {{ documentTypeLabels[doc.type] ?? doc.type }} · {{ formatSize(doc.sizeBytes) }} · {{ new Date(doc.createdAt).toLocaleDateString() }}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Download"
            class="cursor-pointer rounded-lg p-1.5 text-surface-400 hover:bg-surface-50 hover:text-brand-600 dark:hover:bg-surface-800 dark:hover:text-brand-400 transition-colors"
            @click="downloadDocument(doc.id)"
          >
            <Download class="size-4" />
          </button>
          <template v-if="canManageDocuments">
            <button
              v-if="confirmDeleteDocId !== doc.id"
              type="button"
              title="Delete"
              class="cursor-pointer rounded-lg p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-950 dark:hover:text-danger-400 transition-colors"
              @click="confirmDeleteDocId = doc.id"
            >
              <Trash2 class="size-4" />
            </button>
            <template v-else>
              <button
                type="button"
                :disabled="deletingDocId === doc.id"
                class="cursor-pointer rounded-lg bg-danger-600 px-2 py-1 text-xs font-medium text-white hover:bg-danger-700 disabled:opacity-50 transition-colors"
                @click="handleDelete(doc.id)"
              >
                {{ deletingDocId === doc.id ? 'Deleting…' : 'Confirm' }}
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-surface-300 dark:border-surface-600 px-2 py-1 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                @click="confirmDeleteDocId = null"
              >
                Cancel
              </button>
            </template>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>
