<template>
  <div class="min-h-screen bg-surface-50">
    <!-- Simple header -->
    <header class="border-b border-surface-200 bg-white">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center">
          <img src="/pegasus-logo.png" alt="Pegasus Media Project" class="h-8 w-auto object-contain" />
        </NuxtLink>
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
