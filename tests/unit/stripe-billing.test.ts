import { describe, it, expect } from 'vitest'
import { envSchema } from '../../server/utils/env'
import { isBillingActionAllowed, getBillingPlan, BILLING_PLAN_IDS } from '../../shared/billing'

/**
 * Stripe billing tests.
 *
 * Covers the two security/correctness-critical pure layers:
 *  1. Env validation — billing config is all-or-none.
 *  2. Org-scoped authorization decision used by the Stripe plugin's
 *     `authorizeReference` callback.
 */

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.reqcore.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

const fullStripe = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_CLOUD_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_CLOUD_PRO_ANNUAL: 'price_pro_y',
  STRIPE_PRICE_BUSINESS_MONTHLY: 'price_biz_m',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'price_biz_y',
}

describe('Stripe env validation (all-or-none)', () => {
  it('accepts a config with no Stripe vars (billing disabled)', () => {
    const result = envSchema.safeParse(baseEnv)
    expect(result.success).toBe(true)
  })

  it('accepts a fully-specified Stripe config', () => {
    const result = envSchema.safeParse({ ...baseEnv, ...fullStripe })
    expect(result.success).toBe(true)
  })

  it('rejects STRIPE_SECRET_KEY without the webhook secret', () => {
    const { STRIPE_WEBHOOK_SECRET, ...partial } = fullStripe
    const result = envSchema.safeParse({ ...baseEnv, ...partial })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('STRIPE_WEBHOOK_SECRET'))).toBe(true)
    }
  })

  it('rejects STRIPE_SECRET_KEY when any price id is missing', () => {
    const { STRIPE_PRICE_BUSINESS_ANNUAL, ...partial } = fullStripe
    const result = envSchema.safeParse({ ...baseEnv, ...partial })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('STRIPE_PRICE_BUSINESS_ANNUAL'))).toBe(true)
    }
  })
})

describe('isBillingActionAllowed (org-scoped authorization)', () => {
  it('denies non-members for every action', () => {
    for (const action of ['list-subscription', 'upgrade-subscription', 'cancel-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed(null, action)).toBe(false)
      expect(isBillingActionAllowed(undefined, action)).toBe(false)
    }
  })

  it('lets any member read the subscription', () => {
    expect(isBillingActionAllowed('member', 'list-subscription')).toBe(true)
    expect(isBillingActionAllowed('admin', 'list-subscription')).toBe(true)
    expect(isBillingActionAllowed('owner', 'list-subscription')).toBe(true)
  })

  it('denies plain members from mutating billing', () => {
    for (const action of ['upgrade-subscription', 'cancel-subscription', 'restore-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed('member', action)).toBe(false)
    }
  })

  it('allows owners and admins to mutate billing', () => {
    for (const action of ['upgrade-subscription', 'cancel-subscription', 'restore-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed('owner', action)).toBe(true)
      expect(isBillingActionAllowed('admin', action)).toBe(true)
    }
  })
})

describe('billing plan config', () => {
  it('exposes exactly the two self-serve plans', () => {
    expect(BILLING_PLAN_IDS).toEqual(['cloud-pro', 'business'])
  })

  it('resolves plans by id and returns undefined for unknown ids', () => {
    expect(getBillingPlan('cloud-pro')?.name).toBe('Cloud Pro')
    expect(getBillingPlan('business')?.name).toBe('Business')
    expect(getBillingPlan('enterprise')).toBeUndefined()
  })
})
