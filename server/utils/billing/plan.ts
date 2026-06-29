/**
 * Org → billing tier resolution and active-role (open-job) limit enforcement.
 *
 * The plan persisted in `subscription.plan` is one of the Stripe-checkout ids
 * (solo/team/scale). Any org without an active subscription is `free`. Agency is
 * a custom contract and isn't reachable via self-serve checkout, but it's part
 * of the limit table so a manually-provisioned agency org gets the right cap.
 */
import { and, eq, sql } from 'drizzle-orm'
import { subscription, job } from '../../database/schema'
import {
  ACTIVE_ROLE_LIMITS,
  activeRoleLimitForTier,
  tierHasFeature,
  FEATURE_MIN_TIER,
  featureUpgradeMessage,
  type BillingTier,
  type PlanFeature,
} from '../../../shared/billing'
import { isStripeBillingConfigured } from '../env'

/**
 * Subscription statuses that keep paid features enabled.
 *
 * `past_due` is intentionally included as a dunning grace state: Stripe is still
 * trying to collect payment, so we avoid immediately locking teams out of active
 * work. Removing it here changes revenue/access policy and should be paired
 * with a product decision about grace periods or read-only downgrade behavior.
 */
const PAID_ENTITLEMENT_STATUSES = ['active', 'trialing', 'past_due']

/**
 * Resolve an org's billing tier. Returns the persisted plan id for orgs with an
 * active subscription, otherwise `'free'`. Shared by the budget gate and the
 * active-role limit so both agree on what plan an org is on.
 */
export async function resolveOrgPlanId(orgId: string): Promise<BillingTier> {
  const rows = await db
    .select({ plan: subscription.plan, status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, orgId))

  const current = rows.find(r => PAID_ENTITLEMENT_STATUSES.includes(r.status))
  const plan = current?.plan
  return plan && plan in ACTIVE_ROLE_LIMITS ? (plan as BillingTier) : 'free'
}

/** Count an org's currently-open roles (jobs with status 'open'). */
async function countOpenJobs(orgId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`count(*)` })
    .from(job)
    .where(and(eq(job.organizationId, orgId), eq(job.status, 'open')))
  return Number(row?.total ?? 0)
}

export class ActiveRoleLimitError extends Error {
  constructor(
    public readonly tier: BillingTier,
    public readonly limit: number,
    message: string,
  ) {
    super(message)
    this.name = 'ActiveRoleLimitError'
  }
}

/**
 * Assert the org can have one *more* open role. Call this right before opening a
 * job (creating with status 'open', or transitioning an existing job to 'open').
 * Throws an H3 402 when the plan's active-role cap is already reached.
 */
export async function assertActiveRoleLimit(orgId: string): Promise<void> {
  const tier = await resolveOrgPlanId(orgId)
  const limit = activeRoleLimitForTier(tier)
  if (!Number.isFinite(limit)) return // agency / unlimited

  const openCount = await countOpenJobs(orgId)
  if (openCount >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage:
        `Your plan allows ${limit} open role${limit === 1 ? '' : 's'} at a time. ` +
        `Close a role or upgrade to open more.`,
      data: { code: 'ACTIVE_ROLE_LIMIT', tier, limit },
    })
  }
}

/**
 * Assert an already-resolved tier is entitled to a plan-gated feature. Throws an
 * H3 402 (`PLAN_FEATURE_REQUIRED`) otherwise. Use this when you already have the
 * tier in hand (e.g. to gate a sub-feature after a primary check) to avoid a
 * second subscription lookup; otherwise prefer assertPlanFeature.
 */
export function assertTierFeature(tier: BillingTier, feature: PlanFeature): void {
  if (tierHasFeature(tier, feature)) return
  throw createError({
    statusCode: 402,
    statusMessage: featureUpgradeMessage(feature),
    data: { code: 'PLAN_FEATURE_REQUIRED', feature, requiredTier: FEATURE_MIN_TIER[feature], tier },
  })
}

/**
 * Resolve the org's tier and assert it's entitled to `feature`, throwing an
 * H3 402 if not. Returns the resolved tier so the caller can reuse it for
 * further per-tier decisions without a second lookup.
 *
 * When Stripe billing is not configured (self-hosted / CI build), all features
 * are available — there is no subscription to enforce, so the check is skipped.
 */
export async function assertPlanFeature(orgId: string, feature: PlanFeature): Promise<BillingTier> {
  if (!isStripeBillingConfigured(process.env)) return 'scale'
  const tier = await resolveOrgPlanId(orgId)
  assertTierFeature(tier, feature)
  return tier
}
