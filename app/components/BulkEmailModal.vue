<script setup lang="ts">
import { Mail, X, Loader2, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  /** Application IDs to email (already de-duplicated visually by the caller). */
  applicationIds: string[]
}>()

const emit = defineEmits<{ close: []; sent: [] }>()

const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { templates } = useEmailTemplates()

const subject = ref('')
const body = ref('')
const submitting = ref(false)
const selectedTemplateId = ref<string>('')

const recipientCount = computed(() => props.applicationIds.length)

// Reset the form each time the modal opens.
watch(() => props.open, (open) => {
  if (open) {
    subject.value = ''
    body.value = ''
    selectedTemplateId.value = ''
  }
})

function applyTemplate() {
  const t = templates.value.find(t => t.id === selectedTemplateId.value)
  if (!t) return
  subject.value = t.subject
  body.value = t.body
}

async function send() {
  if (!subject.value.trim() || !body.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch<{
      sent: number
      failed: number
      recipients: number
      skippedNoEmail: number
    }>('/api/applications/bulk/email', {
      method: 'POST',
      body: {
        applicationIds: props.applicationIds,
        subject: subject.value,
        body: body.value,
      },
    })
    const parts = [
      `${res.sent} sent`,
      res.failed ? `${res.failed} failed` : '',
      res.skippedNoEmail ? `${res.skippedNoEmail} skipped (no email)` : '',
    ].filter(Boolean)
    if (res.failed) {
      toast.warning('Emails sent with errors', parts.join(', '))
    } else {
      toast.success('Emails sent', parts.join(', ') || 'Done')
    }
    emit('sent')
    emit('close')
  }
  catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to send emails', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
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
      <div class="relative w-full max-w-lg mx-4 rounded-2xl bg-white dark:bg-surface-900 shadow-2xl ring-1 ring-surface-200/80 dark:ring-surface-700/60 p-5">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Mail class="size-4" /> Email applicants
          </h3>
          <button class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Sending to {{ recipientCount }} selected applicant{{ recipientCount === 1 ? '' : 's' }}. Applicants without an email are skipped.
        </p>

        <!-- Optional: prefill from a saved template -->
        <div v-if="templates.length" class="mb-3">
          <label class="block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-1.5">Start from a template</label>
          <div class="relative">
            <select
              v-model="selectedTemplateId"
              class="w-full appearance-none rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 pl-3 pr-8 py-2 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              @change="applyTemplate"
            >
              <option value="">— None —</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
          </div>
        </div>

        <div class="mb-3">
          <label class="block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-1.5">Subject</label>
          <input
            v-model="subject"
            type="text"
            maxlength="300"
            placeholder="Subject line…"
            class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div class="mb-2">
          <label class="block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-1.5">Message</label>
          <textarea
            v-model="body"
            rows="8"
            maxlength="20000"
            placeholder="Write your message…"
            class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
        </div>

        <p class="text-[11px] text-surface-400 dark:text-surface-500 mb-4">
          Placeholders: <code>{{ '{{candidateName}}' }}</code>, <code>{{ '{{candidateFirstName}}' }}</code>, <code>{{ '{{jobTitle}}' }}</code>, <code>{{ '{{organizationName}}' }}</code>
        </p>

        <div class="flex justify-end gap-2">
          <button
            class="rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            :disabled="!subject.trim() || !body.trim() || submitting"
            class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="send"
          >
            <Loader2 v-if="submitting" class="size-4 animate-spin" />
            <Mail v-else class="size-4" />
            Send{{ recipientCount ? ` to ${recipientCount}` : '' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
