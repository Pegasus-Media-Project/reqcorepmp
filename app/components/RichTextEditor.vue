<script setup lang="ts">
/**
 * Lightweight, dependency-free WYSIWYG editor built on `contenteditable` plus a
 * standard toolbar (bold, italic, headings, lists, link, image). Images are
 * embedded inline as base64 data URLs — no upload/storage needed. Content is
 * authored by trusted org admins and rendered with the same trust level as the
 * job description elsewhere in the app.
 */
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, Image as ImageIcon } from 'lucide-vue-next'

const model = defineModel<string>({ default: '' })

const editor = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

/** Keep the DOM in sync when the model changes from outside (e.g. initial load). */
watch(model, (val) => {
  if (editor.value && editor.value.innerHTML !== (val ?? '')) {
    editor.value.innerHTML = val ?? ''
  }
})

onMounted(() => {
  if (editor.value) editor.value.innerHTML = model.value ?? ''
})

function syncModel() {
  if (editor.value) model.value = editor.value.innerHTML
}

/** Run a formatting command against the current selection, then persist. */
function exec(command: string, value?: string) {
  editor.value?.focus()
  document.execCommand(command, false, value)
  syncModel()
}

function addLink() {
  const url = window.prompt('Link URL')
  if (!url) return
  // Basic guard against javascript: URLs.
  if (/^\s*javascript:/i.test(url)) return
  exec('createLink', url)
}

function pickImage() {
  fileInput.value?.click()
}

function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  if (!file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : ''
    if (dataUrl) exec('insertImage', dataUrl)
  }
  reader.readAsDataURL(file)
}

const toolbarButtons = [
  { icon: Bold, label: 'Bold', action: () => exec('bold') },
  { icon: Italic, label: 'Italic', action: () => exec('italic') },
  { icon: Heading2, label: 'Heading', action: () => exec('formatBlock', 'H2') },
  { icon: Heading3, label: 'Subheading', action: () => exec('formatBlock', 'H3') },
  { icon: List, label: 'Bulleted list', action: () => exec('insertUnorderedList') },
  { icon: ListOrdered, label: 'Numbered list', action: () => exec('insertOrderedList') },
  { icon: Link2, label: 'Link', action: addLink },
  { icon: ImageIcon, label: 'Image', action: pickImage },
]
</script>

<template>
  <div class="rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-colors">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-0.5 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 px-1.5 py-1">
      <button
        v-for="btn in toolbarButtons"
        :key="btn.label"
        type="button"
        :title="btn.label"
        :aria-label="btn.label"
        class="rounded p-1.5 text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
        @mousedown.prevent
        @click="btn.action"
      >
        <component :is="btn.icon" class="size-4" />
      </button>
    </div>

    <!-- Editable area -->
    <div
      ref="editor"
      contenteditable="true"
      data-placeholder="Write information to show applicants…"
      class="rte-content min-h-32 max-h-96 overflow-y-auto px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 focus:outline-none"
      @input="syncModel"
      @blur="syncModel"
    />

    <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onImageSelected" />
  </div>
</template>

<style scoped>
.rte-content :deep(h2) { font-size: 1.125rem; font-weight: 600; margin: 0.5rem 0; }
.rte-content :deep(h3) { font-size: 1rem; font-weight: 600; margin: 0.5rem 0; }
.rte-content :deep(ul) { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
.rte-content :deep(ol) { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
.rte-content :deep(a) { color: var(--color-brand-600, #2563eb); text-decoration: underline; }
.rte-content :deep(p) { margin: 0.4rem 0; }
.rte-content :deep(img) { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 0.5rem 0; }
.rte-content:empty::before { content: attr(data-placeholder); color: var(--color-surface-400, #9ca3af); }
</style>
