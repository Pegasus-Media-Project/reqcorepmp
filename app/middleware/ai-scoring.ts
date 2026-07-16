/**
 * Route guard for AI-scoring pages. When the `ai-scoring` feature flag is off
 * (the default), redirect away — the feature is hidden throughout the app.
 */
export default defineNuxtRouteMiddleware(() => {
  const enabled = useFeatureFlagEnabled('ai-scoring')
  if (!enabled.value) {
    return navigateTo(useLocalePath()('/dashboard'))
  }
})
