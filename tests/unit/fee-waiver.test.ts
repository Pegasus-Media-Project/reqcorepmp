import { describe, it, expect } from 'vitest'
import { updateVerificationsSchema, applicationStepStatusValues } from '../../server/utils/schemas/application'
import { EMAIL_TEMPLATE_TYPES, TEMPLATE_VARIABLES_BY_TYPE } from '../../server/utils/schemas/emailTemplate'
import { SYSTEM_TEMPLATES } from '../../shared/system-templates'

/**
 * Waiving excuses one applicant from the fee: the step settles without payment,
 * so it must read as settled everywhere a verified fee does.
 */
describe('application fee waiver', () => {
  it('is an accepted step status', () => {
    expect(applicationStepStatusValues).toContain('waived')
    expect(updateVerificationsSchema.safeParse({ feeStatus: 'waived' }).success).toBe(true)
  })

  it('still rejects a status that isn’t one of the four', () => {
    expect(updateVerificationsSchema.safeParse({ feeStatus: 'forgiven' }).success).toBe(false)
  })

  it('has its own lifecycle template, so nobody is told a payment was confirmed', () => {
    expect(EMAIL_TEMPLATE_TYPES).toContain('fee_waived')
    const template = SYSTEM_TEMPLATES.find(t => t.type === 'fee_waived')
    expect(template).toBeDefined()
    expect(template!.subject).toContain('waived')
    // The waiver note must not imply a payment was received.
    expect(template!.body.toLowerCase()).not.toContain('confirmed your application fee')
  })

  it('offers the waiver template the same placeholders as the other lifecycle mails', () => {
    expect(TEMPLATE_VARIABLES_BY_TYPE.fee_waived).toEqual(TEMPLATE_VARIABLES_BY_TYPE.fee_verified)
  })
})
