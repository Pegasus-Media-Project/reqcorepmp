<script setup lang="ts">
/**
 * Onboarding steps (application fee, signed documents) for a single application,
 * with staff "Mark verified" controls. Shared across the application detail page,
 * the pipeline center panel, and the table-view drawer so verification is
 * available everywhere an application is shown.
 */
const props = defineProps<{
  applicationId: string
  status: string
  feeStatus?: string | null
  documentsStatus?: string | null
  job?: {
    applicationFeeEnabled?: boolean | null
    applicationFeeAmount?: number | null
    applicationFeeCurrency?: string | null
    requireSignedDocuments?: boolean | null
  } | null
  canManage?: boolean
}>()

const emit = defineEmits<{ (e: 'updated'): void }>()

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

// The fee (submission phase) is always relevant when enabled; signed documents
// (acceptance phase) only once the applicant reaches offer/hired.
const showFeeStep = computed(() => !!props.job?.applicationFeeEnabled)
const showDocumentsStep = computed(() =>
  !!props.job?.requireSignedDocuments && (props.status === 'offer' || props.status === 'hired'))
const visible = computed(() => showFeeStep.value || showDocumentsStep.value)

const feeAmountLabel = computed(() => {
  const amount = props.job?.applicationFeeAmount
  if (amount == null) return null
  const cur = (props.job?.applicationFeeCurrency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${cur}`
  }
})

const verifyingStep = ref<'fee' | 'documents' | null>(null)

async function setStepStatus(step: 'fee' | 'documents', status: 'pending' | 'verified') {
  verifyingStep.value = step
  try {
    await $fetch(`/api/applications/${props.applicationId}/verifications`, {
      method: 'PATCH',
      body: step === 'fee' ? { feeStatus: status } : { documentsStatus: status },
    })
    emit('updated')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update verification', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    verifyingStep.value = null
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5"
  >
    <div class="flex items-center gap-2 mb-3">
      <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Onboarding</h2>
    </div>
    <div class="space-y-3">
      <!-- Application fee -->
      <div v-if="showFeeStep" class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-surface-800 dark:text-surface-100">
            Application fee<span v-if="feeAmountLabel" class="text-surface-500"> · {{ feeAmountLabel }}</span>
          </p>
          <p class="text-xs text-surface-500 dark:text-surface-400">
            {{ feeStatus === 'verified' ? 'Payment verified' : 'Awaiting manual verification of payment' }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            :class="feeStatus === 'verified' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
          >
            {{ feeStatus === 'verified' ? 'Verified' : 'Pending' }}
          </span>
          <button
            v-if="canManage && feeStatus !== 'verified'"
            type="button"
            :disabled="verifyingStep === 'fee'"
            class="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            @click="setStepStatus('fee', 'verified')"
          >
            {{ verifyingStep === 'fee' ? 'Saving…' : 'Mark verified' }}
          </button>
          <button
            v-else-if="canManage && feeStatus === 'verified'"
            type="button"
            :disabled="verifyingStep === 'fee'"
            class="rounded-md border border-surface-300 dark:border-surface-600 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 transition hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-60"
            @click="setStepStatus('fee', 'pending')"
          >
            Undo
          </button>
        </div>
      </div>

      <!-- Signed documents -->
      <div v-if="showDocumentsStep" class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-surface-800 dark:text-surface-100">Signed documents</p>
          <p class="text-xs text-surface-500 dark:text-surface-400">
            {{ documentsStatus === 'verified' ? 'Signed documents verified' : 'Awaiting manual verification of signed documents' }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            :class="documentsStatus === 'verified' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
          >
            {{ documentsStatus === 'verified' ? 'Verified' : 'Pending' }}
          </span>
          <button
            v-if="canManage && documentsStatus !== 'verified'"
            type="button"
            :disabled="verifyingStep === 'documents'"
            class="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            @click="setStepStatus('documents', 'verified')"
          >
            {{ verifyingStep === 'documents' ? 'Saving…' : 'Mark verified' }}
          </button>
          <button
            v-else-if="canManage && documentsStatus === 'verified'"
            type="button"
            :disabled="verifyingStep === 'documents'"
            class="rounded-md border border-surface-300 dark:border-surface-600 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 transition hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-60"
            @click="setStepStatus('documents', 'pending')"
          >
            Undo
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
