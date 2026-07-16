<script setup lang="ts">
/**
 * Renders a display-only information block on the application form: an optional
 * heading plus rich HTML content (with inline base64 images). The HTML is
 * authored by trusted org admins in the application builder.
 */
defineProps<{
  block: {
    label?: string | null
    content?: string | null
  }
}>()
</script>

<template>
  <div class="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/60 dark:bg-surface-800/40 px-4 py-3.5">
    <h3 v-if="block.label" class="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1.5">{{ block.label }}</h3>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div class="form-info-content text-sm text-surface-700 dark:text-surface-300 leading-relaxed" v-html="block.content ?? ''" />
  </div>
</template>

<style scoped>
.form-info-content :deep(h2) { font-size: 1.05rem; font-weight: 600; margin: 0.5rem 0; }
.form-info-content :deep(h3) { font-size: 0.95rem; font-weight: 600; margin: 0.5rem 0; }
.form-info-content :deep(ul) { list-style: disc; padding-left: 1.5rem; margin: 0.4rem 0; }
.form-info-content :deep(ol) { list-style: decimal; padding-left: 1.5rem; margin: 0.4rem 0; }
.form-info-content :deep(a) { color: var(--color-brand-600, #2563eb); text-decoration: underline; }
.form-info-content :deep(p) { margin: 0.35rem 0; }
.form-info-content :deep(img) { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 0.5rem 0; }
</style>
