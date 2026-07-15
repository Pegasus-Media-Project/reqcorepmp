<script setup lang="ts">
// Public open-roles board (also rendered at the site root — see
// app/pages/index.vue). Shared UI lives in PublicJobsBoard.
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
  ogImage: '/reqcore-banner-github.jpeg',
  twitterCard: 'summary_large_image',
  twitterTitle: t('jobs.list.ogTitle'),
  twitterDescription: t('jobs.list.twitterDescription'),
})
</script>

<template>
  <PublicJobsBoard />
</template>
