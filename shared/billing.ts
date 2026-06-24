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

export type BillingPlanId = 'cloud-pro' | 'business'

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
  /** Feature bullets shown on the plan card. */
  features: string[]
}

/**
 * Paid, self-serve plans. Mirrors the marketing pricing page
 * (reqcore-web/app/pages/pricing.vue). Community / Cloud Free are $0 and need
 * no checkout; Enterprise is contact-sales — neither appears here.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'cloud-pro',
    name: 'Cloud Pro',
    tagline: 'Your own brand and integrations.',
    monthlyPrice: 49,
    // ~2 months free when billed yearly. Display only — Stripe holds the charge.
    annualPrice: 490,
    features: [
      'Everything in Cloud Free',
      'Custom domain, no Reqcore branding',
      '~100 GB storage · ~5,000 emails/mo',
      'Integrations & email support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Compliance for legal & IT teams.',
    monthlyPrice: 249,
    annualPrice: 2490,
    features: [
      'Everything in Cloud Pro',
      'SSO / SAML / SCIM',
      'Audit log & retention engine',
      'DPA, SLA & priority support',
    ],
  },
]

export const BILLING_PLAN_IDS = BILLING_PLANS.map(p => p.id)

export function getBillingPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.id === id)
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
