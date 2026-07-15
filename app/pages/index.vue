<script setup lang="ts">
// Home page = the public open-roles board. The listing lives in
// PublicJobsBoard so the /jobs route can share the exact same UI.
const { t } = useI18n()

definePageMeta({
  layout: 'public',
})

useSeoMeta({
  title: t('jobs.list.metaTitle'),
  description: t('jobs.list.metaDescription'),
  ogTitle: t('jobs.list.ogTitle'),
  ogDescription: t('jobs.list.ogDescription'),
  ogType: 'website',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <PublicJobsBoard />
</template>
