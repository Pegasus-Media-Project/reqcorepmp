<script setup lang="ts">
const i18nHead = useLocaleHead({
  seo: true,
})

// Job listings/detail and branded career pages serve recruiter-authored,
// single-language content under every locale prefix, so their localized
// variants are noindex (see nuxt.config routeRules + the pages' robots meta).
// Strip the auto-generated hreflang alternates on those routes: advertising
// alternates that point at noindex URLs claims translations that don't exist,
// and Google drops hreflang clusters whose members aren't indexable. Every
// other route (marketing, /pricing) keeps its alternates; the canonical link
// and og:locale meta are left untouched.
const route = useRoute()
const isSingleLocaleUgc = computed(() =>
  /^\/(?:[a-z]{2}\/)?(?:jobs|career)(?:\/|$)/.test(route.path))
const i18nLinks = computed(() =>
  isSingleLocaleUgc.value
    ? i18nHead.value.link.filter((l) => !('hreflang' in l))
    : i18nHead.value.link)

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  link: i18nLinks.value,
  meta: i18nHead.value.meta,
}))

// This instance is forced to light mode. The blocking inline script strips any
// stale `.dark` class before first paint so no dark styling ever renders. The
// nonce attribute is required by the nonce-based CSP set in
// server/middleware/csp.ts — without it the script would be blocked by the
// Content Security Policy (CSP).
const _nonce = import.meta.server ? (useRequestEvent()?.context?.nonce ?? '') : ''
useHead({
  script: [
    {
      key: 'dark-mode-init',
      innerHTML: '(function(){try{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"}catch(e){}})()',
      tagPosition: 'head',
      ...(_nonce ? { nonce: _nonce } : {}),
    },
  ],
})

// Sync Better Auth session → PostHog identity & org group
await usePostHogIdentity()
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <ConsentBanner />
    </ClientOnly>
  </div>
</template>
