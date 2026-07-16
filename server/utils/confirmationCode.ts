import { randomInt } from 'node:crypto'

/**
 * Airline-style confirmation codes for public applications.
 *
 * 6 characters from an unambiguous alphabet — no 0/O, 1/I/L — so applicants can
 * read a code off a screen or email and type it back without confusion. ~31^6
 * ≈ 887M combinations; codes are unique-indexed and generated with collision
 * retry at insert time, and the public status lookup is rate-limited.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generateConfirmationCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)]
  }
  return code
}

/** Normalize user-entered codes for lookup (uppercase, strip spaces/dashes). */
export function normalizeConfirmationCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** A syntactically valid code is exactly 6 chars from the allowed alphabet. */
export function isValidConfirmationCode(code: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code)
}
