<script setup lang="ts">
import { Star } from 'lucide-vue-next'

/**
 * Star rating — interactive input or read-only display.
 *
 * Interactive: click a star to set 1–count; click the current value again to
 * clear. Read-only: renders a fractional fill (for averages like 4.2).
 */
const props = withDefaults(defineProps<{
  modelValue?: number | null
  readonly?: boolean
  count?: number
  /** Star size in pixels. */
  size?: number
}>(), {
  modelValue: null,
  readonly: false,
  count: 5,
  size: 18,
})

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const hover = ref<number | null>(null)

const displayValue = computed(() => hover.value ?? props.modelValue ?? 0)

/** Fill percentage for star `i` (1-based), supporting fractional averages. */
function fillPercent(i: number): number {
  const v = displayValue.value
  if (v >= i) return 100
  if (v <= i - 1) return 0
  return Math.round((v - (i - 1)) * 100)
}

function setValue(i: number) {
  if (props.readonly) return
  emit('update:modelValue', props.modelValue === i ? null : i)
}
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5"
    :class="readonly ? '' : 'cursor-pointer'"
    @mouseleave="hover = null"
  >
    <button
      v-for="i in count"
      :key="i"
      type="button"
      :disabled="readonly"
      class="relative shrink-0"
      :class="readonly ? 'cursor-default' : 'cursor-pointer'"
      :style="{ width: `${size}px`, height: `${size}px` }"
      :aria-label="`${i} star${i === 1 ? '' : 's'}`"
      @click="setValue(i)"
      @mouseenter="!readonly && (hover = i)"
    >
      <!-- Empty base -->
      <Star
        class="absolute inset-0 text-surface-300 dark:text-surface-600"
        :style="{ width: `${size}px`, height: `${size}px` }"
      />
      <!-- Filled overlay, clipped to fill percentage -->
      <span
        class="absolute inset-0 overflow-hidden"
        :style="{ width: `${fillPercent(i)}%` }"
      >
        <Star
          class="text-amber-400 fill-amber-400"
          :style="{ width: `${size}px`, height: `${size}px` }"
        />
      </span>
    </button>
  </div>
</template>
