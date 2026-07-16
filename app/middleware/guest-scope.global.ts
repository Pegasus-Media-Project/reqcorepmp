/**
 * Client-side containment for guest reviewers. Guests are confined server-side
 * to their assigned jobs (jobAccess.ts + requirePermission); this middleware is
 * defense-in-depth + UX: it keeps a guest out of org-wide dashboard pages
 * (candidates, cross-job lists, settings, analytics) and lands them on their
 * scoped jobs list. Real enforcement is always the server.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Role resolution needs the Better Auth client (browser only).
  if (import.meta.server) return

  // Only police dashboard routes.
  const dashIdx = to.path.indexOf('/dashboard')
  if (dashIdx === -1) return
  const rel = to.path.slice(dashIdx) // path from '/dashboard' onward (locale-agnostic)

  let role: string | null = null
  try {
    const { data } = await authClient.organization.getActiveMemberRole()
    role = data?.role ?? null
  }
  catch {
    return // never block navigation because a role lookup failed
  }
  if (role !== 'guest') return

  // Pages a guest may see. Everything is still server-scoped to their jobs.
  const allowed: RegExp[] = [
    /^\/dashboard\/jobs$/, // scoped jobs list — the guest landing
    /^\/dashboard\/jobs\/[^/]+(\/.*)?$/, // a job + its sub-pages (pipeline, ratings, …)
    /^\/dashboard\/applications\/[^/]+$/, // an application detail
    /^\/dashboard\/interviews(\/[^/]+)?$/, // interview list/detail
  ]
  if (allowed.some(re => re.test(rel))) return

  // Block org-wide/admin pages — redirect to the scoped jobs list.
  return navigateTo(useLocalePath()('/dashboard/jobs'))
})
