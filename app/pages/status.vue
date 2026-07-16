<script setup lang="ts">
import { Search, CheckCircle2, AlertCircle } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
})

useSeoMeta({
  title: 'Check application status',
  robots: 'noindex, nofollow',
})

const route = useRoute()

interface StatusResult {
  statusKey: string
  status: string
  jobTitle: string
  submittedAt: string
}

const code = ref(((route.query.code as string) ?? '').toUpperCase())
const loading = ref(false)
const result = ref<StatusResult | null>(null)
const notFound = ref(false)
const errorMsg = ref('')

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function checkStatus() {
  const cleaned = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  code.value = cleaned
  if (cleaned.length !== 6) {
    errorMsg.value = 'Enter the 6-character code from your confirmation email.'
    return
  }

  loading.value = true
  errorMsg.value = ''
  notFound.value = false
  result.value = null

  try {
    result.value = await $fetch<StatusResult>(`/api/public/applications/${cleaned}`)
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404) {
      notFound.value = true
    } else if (status === 429) {
      errorMsg.value = 'Too many attempts. Please try again in a little while.'
    } else {
      errorMsg.value = 'Something went wrong. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Auto-check if arriving with a valid ?code= in the URL (e.g. from the email link).
onMounted(() => {
  if (code.value.replace(/[^A-Z0-9]/g, '').length === 6) checkStatus()
})
</script>

<template>
  <section class="mx-auto max-w-md py-6 sm:py-10">
    <div class="mb-6 text-center">
      <h1 class="text-2xl font-bold text-surface-900">Check application status</h1>
      <p class="mt-1 text-sm text-surface-500">
        Enter the 6-character confirmation code from your application email.
      </p>
    </div>

    <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="checkStatus">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
        <input
          v-model="code"
          type="text"
          maxlength="8"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="e.g. 7KQP2M"
          class="w-full rounded-lg border border-surface-300 bg-white pl-9 pr-3 py-2.5 text-sm font-mono uppercase tracking-widest text-surface-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button
        type="submit"
        :disabled="loading"
        class="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {{ loading ? 'Checking…' : 'Check status' }}
      </button>
    </form>

    <p v-if="errorMsg" class="mt-3 text-sm text-danger-600">{{ errorMsg }}</p>

    <!-- Result -->
    <div
      v-if="result"
      class="mt-6 rounded-xl border border-surface-200 bg-white p-6"
    >
      <div class="flex items-center gap-2 text-brand-600">
        <CheckCircle2 class="size-5" />
        <span class="text-sm font-medium">Application found</span>
      </div>
      <dl class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <dt class="text-sm text-surface-500">Position</dt>
          <dd class="text-sm font-medium text-surface-900 text-right">{{ result.jobTitle }}</dd>
        </div>
        <div class="flex items-center justify-between gap-4">
          <dt class="text-sm text-surface-500">Submitted</dt>
          <dd class="text-sm font-medium text-surface-900 text-right">{{ formatDate(result.submittedAt) }}</dd>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-surface-100 pt-3">
          <dt class="text-sm text-surface-500">Status</dt>
          <dd>
            <span class="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
              {{ result.status }}
            </span>
          </dd>
        </div>
      </dl>
    </div>

    <!-- Not found -->
    <div
      v-else-if="notFound"
      class="mt-6 flex items-start gap-3 rounded-xl border border-surface-200 bg-white p-6"
    >
      <AlertCircle class="size-5 shrink-0 text-surface-400" />
      <div>
        <p class="text-sm font-medium text-surface-900">No application found for that code</p>
        <p class="mt-1 text-sm text-surface-500">
          Double-check the code from your confirmation email — it's 6 characters, letters and numbers.
        </p>
      </div>
    </div>
  </section>
</template>
