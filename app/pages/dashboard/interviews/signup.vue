<script setup lang="ts">
import { ArrowLeft, CalendarClock } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Interview Signup — Pegasus Media Project',
  description: 'Sign up to interview and set your availability',
  robots: 'noindex, nofollow',
})

const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <!-- Back to interviews -->
    <NuxtLink
      :to="localePath('/dashboard/interviews')"
      class="mb-6 inline-flex items-center gap-1 rounded-full border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-1.5 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors no-underline"
    >
      <ArrowLeft class="size-4" />
      Back to Interviews
    </NuxtLink>

    <!-- Page header -->
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <div class="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm shadow-brand-500/20">
            <CalendarClock class="size-5 text-white" />
          </div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">
            Interview Signup
          </h1>
        </div>
        <p class="text-sm text-surface-500 dark:text-surface-400 max-w-xl">
          See every upcoming interview slot for your jobs — including ones no candidate has booked yet. Join individual slots, or set your availability and get assigned to everything inside it automatically.
        </p>
      </div>
    </div>

    <ReviewerSignupPanel />
  </div>
</template>
