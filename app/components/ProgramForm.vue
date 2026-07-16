<script setup lang="ts">
/**
 * Full-page form for creating or editing a program.
 * Mirrors the AI-config form pattern: dedicated page, emits `saved`/`cancel`.
 */
import { Loader2, GraduationCap } from 'lucide-vue-next'
import type { Program } from '~/composables/usePrograms'

const props = defineProps<{ program: Program | null }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()

const { t } = useI18n()
const toast = useToast()
const { createProgram, updateProgram } = usePrograms()

const isEdit = computed(() => props.program !== null)

const form = reactive({
  name: props.program?.name ?? '',
  description: props.program?.description ?? '',
  archived: props.program?.archived ?? false,
})

const isSaving = ref(false)
const error = ref('')

async function handleSubmit() {
  if (!form.name.trim()) {
    error.value = t('programs.form.nameLabel')
    return
  }
  isSaving.value = true
  error.value = ''
  try {
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      archived: form.archived,
    }
    if (isEdit.value && props.program) {
      await updateProgram(props.program.id, body)
    }
    else {
      await createProgram(body)
    }
    await refreshNuxtData('programs')
    emit('saved')
  }
  catch (err: any) {
    error.value = err?.data?.statusMessage ?? t('programs.saveFailed')
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="mb-6 flex items-center gap-3">
      <div class="flex items-center justify-center size-10 rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
        <GraduationCap class="size-5" />
      </div>
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        {{ isEdit ? form.name || t('programs.title') : t('programs.form.create') }}
      </h1>
    </div>

    <form class="space-y-5" @submit.prevent="handleSubmit">
      <div class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5 space-y-4">
        <div>
          <label for="program-name" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            {{ t('programs.form.nameLabel') }}
          </label>
          <input
            id="program-name"
            v-model="form.name"
            type="text"
            :placeholder="t('programs.form.namePlaceholder')"
            class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
          />
        </div>

        <div>
          <label for="program-description" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            {{ t('programs.form.descriptionLabel') }}
          </label>
          <textarea
            id="program-description"
            v-model="form.description"
            rows="3"
            :placeholder="t('programs.form.descriptionPlaceholder')"
            class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-y"
          />
        </div>

        <label class="flex items-start gap-2.5 cursor-pointer">
          <input
            v-model="form.archived"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
          />
          <span class="text-sm">
            <span class="font-medium text-surface-700 dark:text-surface-300">{{ t('programs.form.archivedLabel') }}</span>
            <span class="block text-xs text-surface-500 dark:text-surface-400">{{ t('programs.form.archivedHint') }}</span>
          </span>
        </label>
      </div>

      <div v-if="error" class="rounded-lg bg-danger-50 dark:bg-danger-950/40 border border-danger-200 dark:border-danger-900 px-3 py-2 text-sm text-danger-700 dark:text-danger-400">
        {{ error }}
      </div>

      <div class="flex items-center gap-3 justify-end">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-medium text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          @click="emit('cancel')"
        >
          {{ t('programs.form.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="isSaving || !form.name.trim()"
          class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Loader2 v-if="isSaving" class="size-4 animate-spin" />
          {{ isEdit ? t('programs.form.save') : t('programs.form.create') }}
        </button>
      </div>
    </form>
  </div>
</template>
