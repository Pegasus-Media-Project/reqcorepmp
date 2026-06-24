import { eq } from 'drizzle-orm'
import { subscription as subscriptionTable } from '../../database/schema'

/**
 * Billing status for the active organization.
 *
 * The Stripe plugin is only loaded when STRIPE_SECRET_KEY is set, so the client
 * cannot tell whether billing is available. This endpoint reports that, plus the
 * org's current subscription (read straight from the table the Stripe webhook
 * keeps up to date — no Stripe API call on page load).
 */

// Statuses that mean the org currently has (or is mid-cancellation of) a plan.
const CURRENT_STATUSES = new Set(['active', 'trialing', 'past_due'])

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const orgId = session.session.activeOrganizationId

  const enabled = Boolean(env.STRIPE_SECRET_KEY)
  if (!enabled) {
    return { enabled: false, subscription: null }
  }

  const rows = await db
    .select({
      plan: subscriptionTable.plan,
      status: subscriptionTable.status,
      periodEnd: subscriptionTable.periodEnd,
      cancelAtPeriodEnd: subscriptionTable.cancelAtPeriodEnd,
      billingInterval: subscriptionTable.billingInterval,
    })
    .from(subscriptionTable)
    .where(eq(subscriptionTable.referenceId, orgId))

  // One org normally has one subscription. Prefer an active/trialing/past_due
  // one; otherwise fall back to the most recently relevant row (e.g. canceled).
  const current = rows.find(r => CURRENT_STATUSES.has(r.status)) ?? rows[0] ?? null

  return {
    enabled: true,
    subscription: current
      ? {
          plan: current.plan,
          status: current.status,
          periodEnd: current.periodEnd ? current.periodEnd.toISOString() : null,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd ?? false,
          billingInterval: current.billingInterval ?? null,
        }
      : null,
  }
})
