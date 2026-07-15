/**
 * Light-mode-only color mode.
 *
 * This instance is forced to light mode: the `.dark` class is never applied and
 * dark mode cannot be toggled on. The composable keeps its original shape
 * (`colorMode` / `isDark` / `toggle` / `set`) so existing callers keep working,
 * but every value resolves to light and the mutators are no-ops that also strip
 * any stale `.dark` class / stored preference.
 *
 * To restore user-switchable dark mode, revert this file (see git history) and
 * the dark-mode bootstrap script in app.vue.
 */
export function useColorMode() {
  const colorMode = useState<'light'>('color-mode', () => 'light')
  const isDark = computed(() => false)

  function forceLight() {
    if (import.meta.server) return
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
    try {
      localStorage.removeItem('reqcore-color-mode')
    } catch { /* ignore */ }
  }

  if (import.meta.client) {
    onMounted(forceLight)
  }

  // Mutators are intentionally inert — the app ships light-only.
  function toggle() { forceLight() }
  function set(_mode: 'light' | 'dark') { forceLight() }

  return { colorMode, isDark, toggle, set }
}
