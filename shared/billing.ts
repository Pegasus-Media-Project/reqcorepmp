/**
 * ─────────────────────────────────────────────
 * Billing plans — single source of truth (client + server)
 * ─────────────────────────────────────────────
 *
 * Imported by both the billing UI (app/) and the Stripe plugin wiring
 * (server/utils/auth.ts). This file holds only non-secret, display-level
 * metadata and the canonical plan *names*. The actual Stripe price IDs live in
 * server-side env vars (STRIPE_PRICE_*) and are mapped to these plans in
 * server/utils/auth.ts — they never reach the client bundle.
 *
 * IMPORTANT: `id` is the plan name persisted in the `subscription.plan` column
 * and passed to `authClient.subscription.upgrade({ plan })`. It MUST stay in
 * sync with the plan `name` configured in the Stripe plugin on the server.
 */

/** Self-serve, Stripe-checkout plan ids (persisted in subscription.plan). */
export type BillingPlanId = 'solo' | 'team' | 'scale'

/**
 * Every billing tier, including the ones with no Stripe checkout:
 *  - `free`   — no subscription row; the default for any org.
 *  - `agency` — contact-sales / custom contract.
 */
export type BillingTier = 'free' | BillingPlanId | 'agency'

export interface BillingPlan {
  /** Canonical plan name — stored in subscription.plan and used in upgrade(). */
  id: BillingPlanId
  /** Human-readable name shown in the UI. */
  name: string
  /** One-line description. */
  tagline: string
  /** Display price (USD) per month when billed monthly. */
  monthlyPrice: number
  /**
   * Display price (USD) for the whole year when billed annually.
   * The real charge always comes from Stripe; this is for the UI only.
   * `null` means annual display pricing is not advertised yet.
   */
  annualPrice: number | null
  /**
   * Max number of simultaneously *open* roles (jobs) this plan allows.
   * Enforced server-side in server/utils/billing/plan.ts.
   */
  activeRoleLimit: number
  /** Feature bullets shown on the plan card. */
  features: string[]
}

/**
 * Max number of simultaneously open roles per tier — the canonical limit table.
 * Applies to *every* tier, including free/agency which have no Stripe plan row.
 * Enforced in server/utils/billing/plan.ts (assertActiveRoleLimit).
 */
export const ACTIVE_ROLE_LIMITS: Record<BillingTier, number> = {
  free: 1,
  solo: 2,
  team: 8,
  scale: 24,
  agency: Number.POSITIVE_INFINITY,
}

/**
 * Lifetime allowance of platform-paid AI analysis runs for a free org — the
 * count-based approximation of pricing-v5's "one free AI shortlist per account".
 * Once an org reaches this, platform AI is gated until they upgrade; ranking and
 * everything else stays available. Override with AI_FREE_PLAN_RUN_LIMIT.
 * Enforced in server/utils/ai/budget.ts.
 */
export const FREE_PLAN_ANALYSIS_LIMIT = 50

/**
 * Paid, self-serve plans. Mirrors the marketing pricing page (pricing-v5). Free
 * needs no checkout; Agency is contact-sales, so neither appears here.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'solo',
    name: 'Solo',
    tagline: 'For steady hiring on a role or two.',
    monthlyPrice: 79,
    annualPrice: 790,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.solo,
    features: [
      'Up to 2 active roles',
      'Unlimited applicants and hires per role',
      'Unlimited AI shortlists on every role',
      'Full shortlist workflow',
      'Invite your whole team. No per-seat fees.',
      'Share and export shortlists',
      'Email support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For teams hiring all the time.',
    monthlyPrice: 239,
    annualPrice: 2390,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.team,
    features: [
      'Up to 8 active roles',
      'Unlimited AI shortlists on every role',
      'Deeper analysis on every shortlisted application',
      'Your own domain. No Reqcore branding.',
      'Email and calendar integrations, pipeline, templates',
      'Your whole team included. No per-seat fees.',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For high-volume, multi-team hiring.',
    monthlyPrice: 599,
    annualPrice: 5990,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.scale,
    features: [
      'Up to 24 active roles',
      'Everything in Team',
      'SSO, SAML, SCIM',
      'Audit log and retention controls',
      'DPA and SLA',
      'Bring your own AI key (BYOK)',
      'Dedicated onboarding',
    ],
  },
]

export const BILLING_PLAN_IDS = BILLING_PLANS.map(p => p.id)

export function getBillingPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.id === id)
}

/** Active-role limit for any tier id (unknown ids fall back to the free cap). */
export function activeRoleLimitForTier(tier: string): number {
  return ACTIVE_ROLE_LIMITS[tier as BillingTier] ?? ACTIVE_ROLE_LIMITS.free
}

/** Billing actions the Stripe plugin authorizes via `authorizeReference`. */
export type BillingAction =
  | 'upgrade-subscription'
  | 'list-subscription'
  | 'cancel-subscription'
  | 'restore-subscription'
  | 'billing-portal'

/**
 * Authorization decision for an org-scoped billing action, given the acting
 * user's role in that organization (or null/undefined if they're not a member).
 *
 * - Non-members can do nothing.
 * - Any member may *read* the plan (`list-subscription`).
 * - Only owners/admins may change billing (upgrade/cancel/restore/portal).
 *
 * Pure function so it can be unit-tested without a database; the DB lookup of
 * the role lives in server/utils/auth.ts.
 */
export function isBillingActionAllowed(
  role: string | null | undefined,
  action: string,
): boolean {
  if (!role) return false
  if (action === 'list-subscription') return true
  return role === 'owner' || role === 'admin'
}
