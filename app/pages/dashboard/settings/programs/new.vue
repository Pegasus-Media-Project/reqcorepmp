<script setup lang="ts">
/**
 * Settings → Programs → New — full-page create form.
 */
import { Loader2, AlertTriangle } from 'lucide-vue-next'

definePageMeta({})

const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: () => `${t('programs.form.create')} — Pegasus Media Project`,
})

const { allowed: canManage, isLoading: isPermissionLoading } = usePermission({ program: ['create'] })

function onSaved() {
  navigateTo(localePath('/dashboard/settings/programs'))
}
function onCancel() {
  navigateTo(localePath('/dashboard/settings/programs'))
}
</script>

<template>
  <div>
    <div v-if="isPermissionLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-surface-400" />
    </div>

    <div
      v-else-if="!canManage"
      class="mx-auto max-w-2xl rounded-xl border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-950 p-5 text-sm text-warning-700 dark:text-warning-400 flex items-start gap-3"
    >
      <AlertTriangle class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold mb-1">Insufficient permissions</p>
        <p>{{ t('programs.noPermission') }}</p>
      </div>
    </div>

    <ProgramForm v-else :program="null" @saved="onSaved" @cancel="onCancel" />
  </div>
</template>
