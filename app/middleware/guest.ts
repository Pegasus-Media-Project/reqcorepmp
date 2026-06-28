/**
 * Guest middleware — redirects authenticated users away from auth pages.
 * Apply to sign-in, sign-up, etc. to prevent logged-in users from seeing them.
 *
 * If the user arrived with a pending invitation (via ?invitation=<id>),
 * redirect to the accept-invitation page so it auto-accepts.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: session } = await authClient.useSession(useFetch)
  const localePath = useLocalePath()

  if (session.value) {
    const pendingInvitation = to.query.invitation as string | undefined
    if (pendingInvitation) {
      return navigateTo(localePath(`/auth/accept-invitation/${pendingInvitation}`))
    }

    const checkoutIntent = parseBillingCheckoutIntent(to.query)
    if (checkoutIntent) {
      const query = buildBillingCheckoutQuery(checkoutIntent)
      return navigateTo(localePath({
        path: session.value.session.activeOrganizationId
          ? '/dashboard/settings/billing'
          : '/onboarding/create-org',
        query,
      }))
    }

    if (hasFreePlanIntent(to.query) && !session.value.session.activeOrganizationId) {
      return navigateTo(localePath({
        path: '/onboarding/create-org',
        query: { plan: 'free' },
      }))
    }

    return navigateTo(localePath('/dashboard'))
  }
})
