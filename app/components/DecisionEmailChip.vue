<script setup lang="ts">
import { Mail, MailCheck, MailWarning, Send } from 'lucide-vue-next'

/**
 * Sent-state chip + manual send button for the acceptance / rejection email.
 * Decision emails never send automatically on a stage move — this is where
 * staff fire (or re-fire) them, and see at a glance whether one went out.
 * Renders nothing unless the applicant is in a decision stage.
 */
const props = defineProps<{
  application: {
    id: string
    status: string
    acceptedEmailSentAt?: string | Date | null
    rejectedEmailSentAt?: string | Date | null
  }
  /** Hide the send button (read-only viewers). */
  canSend?: boolean
}>()
const emit = defineEmits<{ sent: [] }>()

const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const kind = computed<'accepted' | 'rejected' | null>(() => {
  if (props.application.status === 'offer' || props.application.status === 'hired') return 'accepted'
  if (props.application.status === 'rejected') return 'rejected'
  return null
})

const sentAt = computed(() => {
  const raw = kind.value === 'accepted'
    ? props.application.acceptedEmailSentAt
    : kind.value === 'rejected' ? props.application.rejectedEmailSentAt : null
  return raw ? new Date(raw) : null
})

const label = computed(() => kind.value === 'accepted' ? 'Acceptance email' : 'Rejection email')

const sending = ref(false)
async function send() {
  if (!kind.value || sending.value) return
  sending.value = true
  try {
    const res = await $fetch<{ to: string }>(`/api/applications/${props.application.id}/send-decision-email`, {
      method: 'POST',
      body: { type: kind.value },
    })
    toast.success(`${label.value} sent to ${res.to}`)
    emit('sent')
  }
  catch (err: any) {
    if (!handlePreviewReadOnlyError(err)) {
      toast.error(err?.data?.statusMessage ?? `Failed to send the ${label.value.toLowerCase()}`)
    }
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="kind" class="inline-flex items-center gap-1.5">
    <span
      class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset"
      :class="sentAt
        ? 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950/60 dark:text-success-400 dark:ring-success-800'
        : 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950/60 dark:text-warning-400 dark:ring-warning-800'"
      :title="sentAt ? `${label} sent ${sentAt.toLocaleString()}` : `${label} has not been sent yet`"
    >
      <component :is="sentAt ? MailCheck : MailWarning" class="size-3" />
      {{ label }} {{ sentAt
        ? `sent ${sentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'not sent' }}
    </span>
    <button
      v-if="canSend !== false"
      :disabled="sending"
      class="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ring-1 ring-inset"
      :class="sentAt
        ? 'text-surface-500 ring-surface-200 hover:bg-surface-50 dark:text-surface-400 dark:ring-surface-700 dark:hover:bg-surface-800'
        : 'bg-brand-600 text-white ring-brand-600 hover:bg-brand-700'"
      @click="send"
    >
      <component :is="sending ? Mail : Send" class="size-3" />
      {{ sending ? 'Sending…' : (sentAt ? 'Resend' : 'Send now') }}
    </button>
  </div>
</template>
