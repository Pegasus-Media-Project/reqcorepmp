import { describe, expect, it } from 'vitest'
import { createJobWizardSchema, updateJobSchema } from '../../server/utils/schemas/job'
import { updateVerificationsSchema } from '../../server/utils/schemas/application'
import { formatFeeAmount } from '../../server/utils/email'
import { SYSTEM_TEMPLATES } from '../../shared/system-templates'

describe('application fee / signing job schema', () => {
  const base = { title: 'Program Coordinator' }

  it('requires a payment link when the application fee is enabled', () => {
    expect(createJobWizardSchema.safeParse({
      ...base,
      applicationFeeEnabled: true,
    }).success).toBe(false)

    expect(createJobWizardSchema.safeParse({
      ...base,
      applicationFeeEnabled: true,
      applicationFeeUrl: 'https://pay.example.com/abc',
    }).success).toBe(true)
  })

  it('requires a signing link when signed documents are required', () => {
    expect(createJobWizardSchema.safeParse({
      ...base,
      requireSignedDocuments: true,
    }).success).toBe(false)

    expect(createJobWizardSchema.safeParse({
      ...base,
      requireSignedDocuments: true,
      signingUrl: 'https://sign.example.com/xyz',
    }).success).toBe(true)
  })

  it('rejects non-URL fee links and upper-cases the currency', () => {
    expect(updateJobSchema.safeParse({ applicationFeeUrl: 'not-a-url' }).success).toBe(false)

    const parsed = updateJobSchema.parse({ applicationFeeCurrency: 'usd' })
    expect(parsed.applicationFeeCurrency).toBe('USD')
  })
})

describe('verification schema', () => {
  it('requires at least one of feeStatus / documentsStatus', () => {
    expect(updateVerificationsSchema.safeParse({}).success).toBe(false)
    expect(updateVerificationsSchema.safeParse({ feeStatus: 'verified' }).success).toBe(true)
    expect(updateVerificationsSchema.safeParse({ documentsStatus: 'pending' }).success).toBe(true)
  })

  it('rejects unknown status values', () => {
    expect(updateVerificationsSchema.safeParse({ feeStatus: 'paid' }).success).toBe(false)
  })
})

describe('formatFeeAmount', () => {
  it('formats minor units into a currency string', () => {
    expect(formatFeeAmount(2500, 'USD')).toBe('$25.00')
  })

  it('returns null when there is no amount', () => {
    expect(formatFeeAmount(null, 'USD')).toBeNull()
    expect(formatFeeAmount(undefined, 'USD')).toBeNull()
  })
})

describe('system lifecycle templates', () => {
  it('ships a default template for every lifecycle event', () => {
    for (const type of ['application_accepted', 'application_rejected', 'fee_verified', 'documents_verified'] as const) {
      expect(SYSTEM_TEMPLATES.some(t => t.type === type)).toBe(true)
    }
  })
})
