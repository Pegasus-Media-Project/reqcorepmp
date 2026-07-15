/**
 * Client-only plugin that enforces light mode before first paint.
 *
 * This instance is light-only: any saved `.dark` preference or OS dark setting
 * is ignored and stripped so no dark styling ever renders. Revert this file
 * (see git history) to restore user-selectable dark mode.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = 'light'
  try {
    localStorage.removeItem('reqcore-color-mode')
  } catch { /* ignore */ }
})
