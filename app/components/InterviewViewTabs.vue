<script setup lang="ts">
import { CalendarDays, CalendarClock } from 'lucide-vue-next'

/**
 * Board (scheduled interviews) vs Signup (join slots / set availability) for a
 * job's Interviews tab. Its own component because it heads both views: the
 * board renders it in its header slot, the signup view above itself.
 */
const view = defineModel<'board' | 'signup'>({ required: true })

const TABS = [
  { value: 'board', label: 'Interviews', icon: CalendarDays },
  { value: 'signup', label: 'Interview Signup', icon: CalendarClock },
] as const
</script>

<template>
  <div class="inline-flex overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
    <button
      v-for="tab in TABS"
      :key="tab.value"
      class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-all cursor-pointer"
      :class="view === tab.value
        ? 'bg-brand-600 text-white'
        : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700'"
      @click="view = tab.value"
    >
      <component :is="tab.icon" class="size-3.5" />
      {{ tab.label }}
    </button>
  </div>
</template>
