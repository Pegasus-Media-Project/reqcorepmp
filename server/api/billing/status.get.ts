import { eq } from 'drizzle-orm'
import { subscription as subscriptionTable } from '../../database/schema'
import { isStripeBillingConfigured } from '../../utils/env'

/**
 * Billing status for the active organization.
 *
 * The Stripe plugin is only loaded when STRIPE_SECRET_KEY is set, so the client
 * cannot tell whether billing is available. This endpoint reports that, plus the
 * org's current subscription (read straight from the table the Stripe webhook
 * keeps up to date — no Stripe API call on page load). It also returns the org's
 * usage vs. plan caps so the billing UI can show free orgs how close they are to
 * the limits the upsell lifts.
 */

// Statuses that mean the org currently has (or is mid-cancellation of) a plan.
const CURRENT_STATUSES = new Set(['active', 'trialing', 'past_due'])

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const orgId = session.session.activeOrganizationId

  const enabled = isStripeBillingConfigured(env)
  if (!enabled) {
    return { enabled: false, subscription: null, usage: null }
  }

  const usage = await getOrgUsage(orgId)

  const rows = await db
    .select({
      plan: subscriptionTable.plan,
      stripeSubscriptionId: subscriptionTable.stripeSubscriptionId,
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
    usage,
    subscription: current
      ? {
          plan: current.plan,
          stripeSubscriptionId: current.stripeSubscriptionId,
          status: current.status,
          periodEnd: current.periodEnd ? current.periodEnd.toISOString() : null,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd ?? false,
          billingInterval: current.billingInterval ?? null,
        }
      : null,
  }
})
