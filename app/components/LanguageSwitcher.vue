<script setup lang="ts">
// Language switcher removed — this instance ships in a single language.
// Rendering nothing here disables the selector everywhere it's used (nav bars,
// public/auth layouts, settings) without touching each call site. Props are
// accepted-and-ignored so existing usages like `<LanguageSwitcher drop-up />`
// don't emit unknown-prop warnings. Revert this file (see git history) to
// restore the full language picker.
defineProps<{
  dropUp?: boolean
  align?: 'left' | 'right'
  showLabel?: boolean
  showName?: boolean
  prominent?: boolean
}>()
</script>

<template>
  <!-- intentionally empty: language selector disabled -->
</template>
