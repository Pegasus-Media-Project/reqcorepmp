<script setup lang="ts">
// Public shell (home / job board / career pages). The header keeps the auth
// actions in the top-right corner: Dashboard when signed in, otherwise
// Sign in / Sign up.
const localePath = useLocalePath()
const { data: session } = await authClient.useSession(useFetch)
</script>

<template>
  <div class="min-h-screen bg-surface-50">
    <!-- Simple header -->
    <header class="border-b border-surface-200 bg-white">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center">
          <img src="/pegasus-logo.png" alt="Pegasus Media Project" class="h-8 w-auto object-contain" />
        </NuxtLink>

        <!-- Auth actions -->
        <div class="flex items-center gap-2">
          <template v-if="session?.user">
            <NuxtLink
              :to="localePath('/dashboard')"
              class="rounded-md bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-700 no-underline"
            >
              Dashboard
            </NuxtLink>
          </template>
          <template v-else>
            <NuxtLink
              :to="localePath('/auth/sign-in')"
              class="rounded-md px-3 py-1.5 text-[13px] font-medium text-surface-600 transition hover:text-surface-900 no-underline"
            >
              Sign in
            </NuxtLink>
            <NuxtLink
              :to="localePath('/auth/sign-up')"
              class="rounded-md bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-700 no-underline"
            >
              Sign up
            </NuxtLink>
          </template>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-surface-200 mt-12">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <p class="text-xs text-surface-400 text-center">
          Pegasus Media Project
        </p>
      </div>
    </footer>
  </div>
</template>
