import { describe, it, expect } from 'vitest'
import {
  sanitizePhoneInput,
  isValidPhone,
  sanitizeNumberInput,
  isNumericText,
  isNumericAnswer,
  isValidEmail,
} from '../../shared/fieldFormats'
import { publicApplicationSchema } from '../../server/utils/schemas/publicApplication'

describe('phone input', () => {
  it('strips letters and stray symbols as they are typed', () => {
    expect(sanitizePhoneInput('555abc0100')).toBe('5550100')
    expect(sanitizePhoneInput('call me: 555-0100')).toBe('  555-0100')
    expect(sanitizePhoneInput('555#0100$')).toBe('5550100')
  })

  it('keeps the punctuation phone numbers are written with', () => {
    expect(sanitizePhoneInput('+1 (555) 010-0199')).toBe('+1 (555) 010-0199')
    expect(sanitizePhoneInput('555.010.0199')).toBe('555.010.0199')
  })

  it('allows a country prefix only at the front', () => {
    expect(sanitizePhoneInput('+15550100')).toBe('+15550100')
    expect(sanitizePhoneInput('555+0100')).toBe('5550100')
  })

  it('accepts real numbers and rejects text or stubs', () => {
    expect(isValidPhone('+1 (555) 010-0199')).toBe(true)
    expect(isValidPhone('5550100')).toBe(true)
    expect(isValidPhone('555-0100 ext. 12')).toBe(false)
    expect(isValidPhone('call me')).toBe(false)
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('1'.repeat(21))).toBe(false)
    // Surrounding whitespace is trimmed, not treated as a stray character.
    expect(isValidPhone('  555-0100  ')).toBe(true)
  })
})

describe('number input', () => {
  it('drops anything that is not part of a number', () => {
    expect(sanitizeNumberInput('12abc3')).toBe('123')
    expect(sanitizeNumberInput('1e5')).toBe('15')
    expect(sanitizeNumberInput('$1,200')).toBe('1200')
  })

  it('keeps one decimal point and a leading minus', () => {
    expect(sanitizeNumberInput('3.14')).toBe('3.14')
    expect(sanitizeNumberInput('3.1.4')).toBe('3.14')
    expect(sanitizeNumberInput('-7')).toBe('-7')
    expect(sanitizeNumberInput('7-7')).toBe('77')
  })

  it('preserves values that are still being typed', () => {
    expect(sanitizeNumberInput('-')).toBe('-')
    expect(sanitizeNumberInput('12.')).toBe('12.')
  })

  it('only treats parseable text as a number', () => {
    expect(isNumericText('12.5')).toBe(true)
    expect(isNumericText('-')).toBe(false)
    expect(isNumericText('')).toBe(false)
    expect(isNumericAnswer(42)).toBe(true)
    expect(isNumericAnswer('42')).toBe(true)
    expect(isNumericAnswer('forty two')).toBe(false)
    expect(isNumericAnswer(true)).toBe(false)
    expect(isNumericAnswer(['1'])).toBe(false)
  })
})

describe('email', () => {
  it('checks the basic shape', () => {
    expect(isValidEmail(' ada@example.com ')).toBe(true)
    expect(isValidEmail('ada@example')).toBe(false)
    expect(isValidEmail('ada')).toBe(false)
  })
})

describe('submitted applications', () => {
  const base = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }

  it('rejects a phone number carrying text', () => {
    expect(publicApplicationSchema.safeParse({ ...base, phone: '555-0100 or email me' }).success).toBe(false)
  })

  it('accepts a well-formed phone number, and none at all', () => {
    expect(publicApplicationSchema.safeParse({ ...base, phone: '+1 (555) 010-0199' }).success).toBe(true)
    expect(publicApplicationSchema.safeParse(base).success).toBe(true)
    expect(publicApplicationSchema.safeParse({ ...base, phone: '' }).success).toBe(true)
  })
})
