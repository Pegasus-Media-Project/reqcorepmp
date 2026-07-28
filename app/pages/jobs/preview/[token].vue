<script setup lang="ts">
import { Eye, Briefcase } from 'lucide-vue-next'

/**
 * Read-only review of a job's application form, reached by an unguessable
 * token a recruiter shares. Works while the job is still a draft, needs no
 * account, and cannot submit: the form renders live so a reviewer can page
 * through every step and try the fields, but the submit handler only ever
 * shows a notice.
 */
definePageMeta({
  layout: 'public',
})

const route = useRoute()
const token = route.params.token as string
const { t } = useI18n()

const { data: job, status: fetchStatus, error: fetchError } = useFetch(
  `/api/public/job-preview/${token}`,
  { key: `job-preview-${token}` },
)

useSeoMeta({
  title: computed(() => job.value ? `Preview — ${job.value.title}` : 'Application form preview'),
  robots: 'noindex, nofollow',
})

// Local state so the form behaves normally while being tried out. None of it
// leaves the page.
const form = ref({ firstName: '', lastName: '', email: '', phone: '', website: '' })
const responses = ref<Record<string, string | string[] | number | boolean | Record<string, number>>>({})
const resumeFile = ref<File | null>(null)
const coverLetterText = ref('')
const errors = ref<Record<string, string>>({})

const submitNotice = ref(false)

function handleSubmit() {
  submitNotice.value = true
}
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="fetchStatus === 'pending'" class="animate-pulse space-y-4">
      <div class="h-7 w-48 bg-surface-200 dark:bg-surface-800 rounded-lg" />
      <div class="h-5 w-32 bg-surface-200 dark:bg-surface-800 rounded-full" />
      <div class="h-4 w-64 bg-surface-200 dark:bg-surface-800 rounded" />
      <div class="mt-8 h-48 bg-surface-200 dark:bg-surface-800 rounded-xl" />
    </div>

    <!-- Expired, revoked or unknown token -->
    <div v-else-if="fetchError" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="mb-5 flex size-16 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800">
        <Briefcase class="size-7 text-surface-400" />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-100 mb-2">This preview link isn't available</h1>
      <p class="text-sm text-surface-500 max-w-xs">
        It may have expired or been revoked. Ask whoever shared it for a fresh link.
      </p>
    </div>

    <template v-else-if="job">
      <!-- Preview banner: this is not a live application -->
      <div class="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <Eye class="size-4 text-amber-700 dark:text-amber-300" />
        </span>
        <div>
          <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Preview for review{{ job.status !== 'open' ? ' — this role isn’t published yet' : '' }}
          </p>
          <p class="mt-1 text-sm leading-6 text-amber-800/80 dark:text-amber-200/70">
            This is exactly how the application form will look to applicants. Try the fields freely —
            nothing you type is saved, and this link can't submit an application.
          </p>
        </div>
      </div>

      <PublicJobApplicationHeader :job="job" />

      <ApplicationFormBody
        v-model:form="form"
        v-model:responses="responses"
        v-model:resume="resumeFile"
        v-model:cover-letter="coverLetterText"
        :job="job"
        :sections="job.sections ?? []"
        :errors="errors"
        @clear-error="(key: string) => delete errors[key]"
        @submit="handleSubmit"
      />

      <div
        v-if="submitNotice"
        class="mt-4 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-5 py-4 text-sm text-surface-600 dark:text-surface-300"
      >
        This is a preview link — applications can't be submitted here. Send your feedback to whoever shared it with you.
      </div>

      <!-- GDPR privacy notice (org-configurable), mirrored from the real form -->
      <p
        v-if="job.privacyPolicyText || job.privacyPolicyUrl || job.privacyContactEmail"
        class="mt-6 text-xs leading-relaxed text-surface-400 dark:text-surface-500"
      >
        <template v-if="job.privacyPolicyText">{{ job.privacyPolicyText }} </template>
        <template v-else>
          {{ t('retention.privacy.defaultNotice', { organization: job.organizationName || t('retention.privacy.thisOrganization') }) }}
        </template>
      </p>
    </template>
  </div>
</template>
