<script setup lang="ts">
import { ArrowRight, BriefcaseBusiness, Building2, Check, House } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const jobSlug = route.params.slug as string
const { track } = useTrack()
const { t } = useI18n()
const config = useRuntimeConfig()
const organizationLogoFailed = ref(false)

// Confirmation code passed from the apply step (?code=). Shown so the applicant
// can save it and check status later at /status.
const code = (route.query.code as string | undefined)?.toUpperCase()
const copied = ref(false)
async function copyCode() {
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard unavailable — user can still read the code */ }
}

onMounted(() => track('application_confirmed', { slug: jobSlug }))

// Optionally fetch job title for a nicer confirmation
const { data: job } = useFetch(`/api/public/jobs/${jobSlug}`, {
  key: `public-job-confirm-${jobSlug}`,
})

useSeoMeta({
  title: t('jobs.confirmation.metaTitle'),
  robots: 'noindex, nofollow',
})

function formatFee(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${cur}`
  }
}
</script>

<template>
  <section class="flex justify-center py-6 sm:py-12">
    <article class="w-full max-w-2xl overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.5)] dark:border-surface-800 dark:bg-surface-900 dark:shadow-none">
      <div class="border-b border-surface-100 px-6 py-4 sm:px-9 dark:border-surface-800">
        <div class="inline-flex items-center gap-2 text-xs font-semibold text-success-700 dark:text-success-400">
          <span class="flex size-5 items-center justify-center rounded-full bg-success-100 dark:bg-success-950">
            <Check class="size-3" :stroke-width="2.5" />
          </span>
          {{ t('jobs.confirmation.received') }}
        </div>
      </div>

      <div class="px-6 py-9 sm:px-9 sm:py-11">
        <div class="max-w-lg">
          <h1 class="text-3xl font-bold leading-tight text-surface-950 sm:text-4xl dark:text-white">
            {{ t('jobs.confirmation.title') }}
          </h1>

          <p class="mt-4 text-base leading-7 text-surface-600 dark:text-surface-300">
            <i18n-t v-if="job" keypath="jobs.confirmation.thanksWithTitle" tag="span">
              <template #title>
                <strong class="font-semibold text-surface-900 dark:text-surface-100">{{ job.title }}</strong>
              </template>
            </i18n-t>
            <template v-else>{{ t('jobs.confirmation.thanksPlain') }}</template>
          </p>

          <!-- Confirmation code -->
          <div
            v-if="code"
            class="mt-6 rounded-xl border border-surface-200 bg-surface-50 p-5 dark:border-surface-800 dark:bg-surface-950/40"
          >
            <p class="text-xs font-medium uppercase tracking-wide text-surface-500">
              Your confirmation code
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <span class="font-mono text-2xl font-bold tracking-[0.2em] text-surface-900 dark:text-white">
                {{ code }}
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-surface-300 px-2.5 py-1 text-xs font-medium text-surface-600 transition hover:bg-surface-100 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
                @click="copyCode"
              >
                <Check v-if="copied" class="size-3.5 text-success-600" :stroke-width="2.5" />
                {{ copied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <p class="mt-3 text-sm leading-6 text-surface-500 dark:text-surface-400">
              Save this code — you'll need it to
              <NuxtLink :to="`/status?code=${code}`" class="font-medium text-brand-600 hover:underline">check your application status</NuxtLink>.
              We've also emailed it to you.
            </p>
          </div>

          <!-- Application fee reminder -->
          <div
            v-if="job && (job as any).applicationFeeEnabled && (job as any).applicationFeeUrl"
            class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30"
          >
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">Action needed: pay your application fee</p>
            <p class="mt-1 text-sm leading-6 text-amber-800/80 dark:text-amber-200/70">
              <template v-if="formatFee((job as any).applicationFeeAmount, (job as any).applicationFeeCurrency)">
                This application requires a fee of
                <strong>{{ formatFee((job as any).applicationFeeAmount, (job as any).applicationFeeCurrency) }}</strong>, payable now.
              </template>
              <template v-else>This application requires a fee, payable now.</template>
              A member of our team will manually verify your payment.
            </p>
            <a
              :href="(job as any).applicationFeeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Pay application fee
            </a>
          </div>
        </div>
      </div>

      <div
        v-if="job"
        class="flex items-center gap-4 border-y border-surface-100 bg-surface-50/70 px-6 py-5 sm:px-9 dark:border-surface-800 dark:bg-surface-950/35"
      >
        <span class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-800">
          <img
            v-if="job.organizationLogo && !organizationLogoFailed"
            :src="job.organizationLogo"
            :alt="t('jobs.detail.companyLogoAlt', { name: job.organizationName })"
            class="size-full object-contain p-1.5"
            @error="organizationLogoFailed = true"
          >
          <Building2 v-else class="size-5 text-surface-500 dark:text-surface-300" />
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
            {{ job.title }}
          </p>
          <p class="mt-0.5 truncate text-sm text-surface-500 dark:text-surface-400">
            {{ job.organizationName }}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <NuxtLink
            :to="$localePath('/jobs')"
            class="inline-flex items-center gap-2 text-sm font-semibold text-surface-600 transition-colors hover:text-surface-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-surface-300 dark:hover:text-white dark:focus-visible:ring-offset-surface-900"
          >
            <BriefcaseBusiness class="size-4" />
            {{ t('jobs.confirmation.browseMore') }}
          </NuxtLink>
          <a
            :href="config.public.marketingUrl"
            class="inline-flex items-center gap-2 text-sm font-medium text-surface-500 transition-colors hover:text-surface-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-surface-400 dark:hover:text-surface-200 dark:focus-visible:ring-offset-surface-900"
          >
            <House class="size-4" />
            {{ t('jobs.confirmation.backHome') }}
          </a>
        </div>

        <NuxtLink
          v-if="job?.careerPageSlug"
          :to="$localePath(`/career/${job.careerPageSlug}`)"
          class="group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-surface-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:bg-white dark:text-surface-950 dark:hover:bg-surface-100 dark:focus-visible:ring-offset-surface-900"
        >
          <span class="max-w-64 truncate">
            {{ t('jobs.confirmation.backToCareerPage', { name: job.organizationName }) }}
          </span>
          <ArrowRight class="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </NuxtLink>
      </div>
    </article>
  </section>
</template>
