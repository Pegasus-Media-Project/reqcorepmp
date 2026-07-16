<script setup lang="ts">
/**
 * Settings → Programs → [id] — edit a program and manage who can access it.
 */
import { Loader2, AlertTriangle } from 'lucide-vue-next'
import type { Program } from '~/composables/usePrograms'

definePageMeta({})

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const programId = computed(() => route.params.id as string)

const { allowed: canManage, isLoading: isPermissionLoading } = usePermission({ program: ['update'] })

const { data: program, status } = await useFetch<Program>(() => `/api/programs/${programId.value}`, {
  key: computed(() => `program-${programId.value}`),
  headers: useRequestHeaders(['cookie']),
})

useSeoMeta({
  title: () => `${program.value?.name ?? t('programs.title')} — Pegasus Media Project`,
})

function onSaved() {
  navigateTo(localePath('/dashboard/settings/programs'))
}
function onCancel() {
  navigateTo(localePath('/dashboard/settings/programs'))
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div v-if="isPermissionLoading || status === 'pending'" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-surface-400" />
    </div>

    <div
      v-else-if="!canManage"
      class="rounded-xl border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-950 p-5 text-sm text-warning-700 dark:text-warning-400 flex items-start gap-3"
    >
      <AlertTriangle class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold mb-1">Insufficient permissions</p>
        <p>{{ t('programs.noPermission') }}</p>
      </div>
    </div>

    <div v-else-if="!program" class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-8 text-center text-sm text-surface-500">
      {{ t('programs.empty') }}
    </div>

    <template v-else>
      <ProgramForm :program="program" @saved="onSaved" @cancel="onCancel" />

      <AssigneesPanel
        :list-url="`/api/programs/${program.id}/members`"
        :title="t('programs.assignments.title')"
        :description="t('programs.assignments.description')"
        :can-manage="canManage"
      />
    </template>
  </div>
</template>
