<script setup lang="ts">
/**
 * Settings → Programs
 *
 * Lists every program (e.g. Pegasus cohorts) with its job count. Adding/editing
 * happens on dedicated pages (`./new` and `./[id]`), mirroring the AI triad.
 */
import { GraduationCap, Plus, Loader2, AlertTriangle, Pencil, Trash2, Archive } from 'lucide-vue-next'

definePageMeta({})

const { t } = useI18n()

useSeoMeta({
  title: () => `${t('programs.title')} — Pegasus Media Project`,
  description: () => t('programs.description'),
})

const { allowed: canManage, isLoading: isPermissionLoading } = usePermission({ program: ['create'] })
const toast = useToast()
const { programs, refresh, status } = usePrograms()

const isLoading = computed(() => status.value === 'pending' && (programs.value?.length ?? 0) === 0)

const deletingId = ref<string | null>(null)
async function deleteProgramRow(p: { id: string, name: string }) {
  if (!confirm(t('programs.deleteConfirm', { name: p.name }))) return
  deletingId.value = p.id
  try {
    await $fetch(`/api/programs/${p.id}`, { method: 'DELETE', headers: useRequestHeaders(['cookie']) })
    toast.success(t('programs.deleted'))
    await refresh()
  }
  catch (err: any) {
    toast.error(t('programs.deleteFailed'), { message: err?.data?.statusMessage })
  }
  finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">{{ t('programs.title') }}</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">{{ t('programs.description') }}</p>
      </div>
      <NuxtLink
        v-if="canManage"
        :to="$localePath('/dashboard/settings/programs/new')"
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus class="size-4" />
        {{ t('programs.addButton') }}
      </NuxtLink>
    </div>

    <!-- Permission guard -->
    <div v-if="isPermissionLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-surface-400" />
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-8 text-center text-sm text-surface-500">
      <Loader2 class="size-5 animate-spin mx-auto mb-2 text-surface-400" />
      {{ t('programs.loading') }}
    </div>

    <!-- Empty state -->
    <div
      v-else-if="(programs?.length ?? 0) === 0"
      class="rounded-2xl border border-dashed border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 p-10 text-center"
    >
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 mb-3">
        <GraduationCap class="size-6" />
      </div>
      <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('programs.empty') }}</h2>
      <p class="mt-1 mb-4 text-sm text-surface-500 dark:text-surface-400">{{ t('programs.emptyHint') }}</p>
      <NuxtLink
        v-if="canManage"
        :to="$localePath('/dashboard/settings/programs/new')"
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus class="size-4" />
        {{ t('programs.addFirst') }}
      </NuxtLink>
    </div>

    <!-- Program cards -->
    <ul v-else class="space-y-3">
      <li
        v-for="p in programs"
        :key="p.id"
        class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900"
      >
        <div class="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-brand-600 dark:text-brand-400">
              <GraduationCap class="size-5" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-semibold text-surface-950 dark:text-surface-50">{{ p.name }}</h3>
                <span class="inline-flex items-center rounded-full border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 px-2 py-0.5 text-[11px] font-medium text-surface-600 dark:text-surface-300">
                  {{ t('programs.jobCount', { count: p.jobCount }, p.jobCount) }}
                </span>
                <span
                  v-if="p.archived"
                  class="inline-flex items-center gap-1 rounded-full border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[11px] font-medium text-surface-500 dark:text-surface-400"
                >
                  <Archive class="size-3" /> {{ t('programs.archived') }}
                </span>
              </div>
              <p v-if="p.description" class="mt-1 text-xs text-surface-500 dark:text-surface-400 line-clamp-2">{{ p.description }}</p>
            </div>
          </div>

          <div v-if="canManage" class="flex flex-wrap items-center gap-1.5 shrink-0">
            <NuxtLink
              :to="$localePath(`/dashboard/settings/programs/${p.id}`)"
              class="inline-flex items-center gap-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              <Pencil class="size-3.5" />
              Edit
            </NuxtLink>
            <button
              :disabled="deletingId === p.id"
              class="inline-flex items-center gap-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-danger-600 dark:text-danger-400 hover:border-danger-300 dark:hover:border-danger-700 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click="deleteProgramRow(p)"
            >
              <Loader2 v-if="deletingId === p.id" class="size-3.5 animate-spin" />
              <Trash2 v-else class="size-3.5" />
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
