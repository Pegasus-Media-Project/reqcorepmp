/**
 * Input formats for the two application-form fields that only ever hold
 * numbers: the built-in phone field and `number` questions.
 *
 * The sanitizers run on every keystroke and paste so unwanted characters never
 * land in the field at all; the validators are the matching check, used inline
 * as the applicant types and again on the server.
 */

/** Same shape check the server applies — kept here so both ends agree. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** Digits, spaces and the punctuation real phone numbers are written with. */
const PHONE_DISALLOWED = /[^\d+()\-.\s]/g

/** Shortest and longest run of digits accepted as a phone number. */
export const PHONE_MIN_DIGITS = 6
export const PHONE_MAX_DIGITS = 20

/**
 * Strip anything that can't appear in a phone number. `+` is a country prefix,
 * so it survives only at the front.
 */
export function sanitizePhoneInput(raw: string): string {
  const cleaned = raw.replace(PHONE_DISALLOWED, '')
  const leadingPlus = cleaned.startsWith('+')
  const withoutPluses = cleaned.replace(/\+/g, '')
  return leadingPlus ? `+${withoutPluses}` : withoutPluses
}

/** Whether a phone number is complete enough to accept. Empty is for the caller to judge. */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim()
  if (sanitizePhoneInput(trimmed) !== trimmed) return false
  const digits = trimmed.replace(/\D/g, '').length
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS
}

/**
 * Strip anything that isn't part of a decimal number, keeping at most one
 * leading minus and one decimal point. Intermediate states a person types on
 * the way to a number — `-`, `.`, `12.` — are preserved.
 */
export function sanitizeNumberInput(raw: string): string {
  const negative = raw.trimStart().startsWith('-')
  const digitsAndDots = raw.replace(/[^\d.]/g, '')
  const [whole, ...rest] = digitsAndDots.split('.')
  const body = rest.length ? `${whole}.${rest.join('')}` : whole ?? ''
  return negative ? `-${body}` : body
}

/** Whether text parses to a finite number. `-` and `.` alone do not. */
export function isNumericText(value: string): boolean {
  if (!value.trim()) return false
  return Number.isFinite(Number(value))
}

/** Whether a stored answer to a `number` question is actually numeric. */
export function isNumericAnswer(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return isNumericText(value)
  return false
}
