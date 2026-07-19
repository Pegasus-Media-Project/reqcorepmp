<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Interviews — Pegasus Media Project',
  description: 'Manage all scheduled interviews',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <InterviewsBoard />
</template>
