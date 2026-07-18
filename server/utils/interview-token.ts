/**
 * HMAC-signed tokens for candidate interview responses.
 *
 * Tokens encode {interviewId, action, exp} and are signed with
 * BETTER_AUTH_SECRET using HMAC-SHA256. This allows candidates to
 * accept/decline/tentative an interview via a simple link — no
 * authentication required, no inbound email infrastructure needed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type CandidateAction = 'accepted' | 'declined' | 'tentative'

const VALID_ACTIONS: CandidateAction[] = ['accepted', 'declined', 'tentative']

/** Default token expiry: 7 days */
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

interface TokenPayload {
  /** Interview UUID */
  id: string
  /** Response action */
  action: CandidateAction
  /** Expiry timestamp (ms since epoch) */
  exp: number
}

/**
 * Compute HMAC-SHA256 signature for a payload string.
 */
function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Generate a signed interview response token.
 *
 * Token format: base64url({id, action, exp}).signature
 * The signature prevents tampering; expiry prevents indefinite reuse.
 */
export function generateInterviewToken(
  interviewId: string,
  action: CandidateAction,
  secret: string,
  expiryMs: number = DEFAULT_EXPIRY_MS,
): string {
  const payload: TokenPayload = {
    id: interviewId,
    action,
    exp: Date.now() + expiryMs,
  }

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(payloadStr, secret)

  return `${payloadStr}.${signature}`
}

/**
 * Verify and decode an interview response token.
 * Returns the payload if valid, or null if the signature is invalid or the token is expired.
 */
export function verifyInterviewToken(
  token: string,
  secret: string,
): TokenPayload | null {
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return null

  const payloadStr = token.slice(0, dotIndex)
  const providedSig = token.slice(dotIndex + 1)

  // Verify signature with timing-safe comparison
  const expectedSig = sign(payloadStr, secret)
  if (providedSig.length !== expectedSig.length) return null

  const sigValid = timingSafeEqual(
    Buffer.from(providedSig, 'hex'),
    Buffer.from(expectedSig, 'hex'),
  )
  if (!sigValid) return null

  // Decode and validate payload
  let payload: TokenPayload
  try {
    const decoded = Buffer.from(payloadStr, 'base64url').toString('utf-8')
    payload = JSON.parse(decoded) as TokenPayload
  }
  catch {
    return null
  }

  // Validate structure
  if (
    typeof payload.id !== 'string'
    || !VALID_ACTIONS.includes(payload.action)
    || typeof payload.exp !== 'number'
  ) {
    return null
  }

  // Check expiry
  if (Date.now() > payload.exp) return null

  return payload
}

/**
 * Build the three response URLs (accept, decline, tentative) for an interview.
 */
export function buildResponseUrls(
  baseUrl: string,
  interviewId: string,
  secret: string,
): Record<CandidateAction, string> {
  const actions: CandidateAction[] = ['accepted', 'declined', 'tentative']
  const urls = {} as Record<CandidateAction, string>

  for (const action of actions) {
    const token = generateInterviewToken(interviewId, action, secret)
    urls[action] = `${baseUrl}/interview/respond?token=${encodeURIComponent(token)}`
  }

  return urls
}

// ─────────────────────────────────────────────
// Slot self-scheduling tokens
// ─────────────────────────────────────────────
//
// A distinct token that authorizes ONE application to browse and book a shared
// interview slot. The `t: 'slot_book'` discriminator keeps these tokens from
// being interchangeable with the accept/decline tokens above (and vice-versa).

/** Discriminator tag stored in booking-token payloads. */
const SLOT_BOOK_TAG = 'slot_book'

interface BookingTokenPayload {
  /** Application UUID authorized to book. */
  aid: string
  /** Token-type discriminator. */
  t: typeof SLOT_BOOK_TAG
  /** Expiry timestamp (ms since epoch). */
  exp: number
}

/**
 * Generate a signed slot-booking token for an application.
 * Token format: base64url({aid, t, exp}).signature
 */
export function generateBookingToken(
  applicationId: string,
  secret: string,
  expiryMs: number = DEFAULT_EXPIRY_MS,
): string {
  const payload: BookingTokenPayload = {
    aid: applicationId,
    t: SLOT_BOOK_TAG,
    exp: Date.now() + expiryMs,
  }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(payloadStr, secret)
  return `${payloadStr}.${signature}`
}

/**
 * Verify and decode a slot-booking token.
 * Returns `{ applicationId }` if valid, or null if the signature is invalid,
 * the discriminator doesn't match, or the token is expired.
 */
export function verifyBookingToken(
  token: string,
  secret: string,
): { applicationId: string } | null {
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return null

  const payloadStr = token.slice(0, dotIndex)
  const providedSig = token.slice(dotIndex + 1)

  const expectedSig = sign(payloadStr, secret)
  if (providedSig.length !== expectedSig.length) return null

  const sigValid = timingSafeEqual(
    Buffer.from(providedSig, 'hex'),
    Buffer.from(expectedSig, 'hex'),
  )
  if (!sigValid) return null

  let payload: BookingTokenPayload
  try {
    const decoded = Buffer.from(payloadStr, 'base64url').toString('utf-8')
    payload = JSON.parse(decoded) as BookingTokenPayload
  }
  catch {
    return null
  }

  if (
    typeof payload.aid !== 'string'
    || payload.t !== SLOT_BOOK_TAG
    || typeof payload.exp !== 'number'
  ) {
    return null
  }

  if (Date.now() > payload.exp) return null

  return { applicationId: payload.aid }
}

/** Build the candidate-facing booking URL for an application. */
export function buildBookingUrl(
  baseUrl: string,
  applicationId: string,
  secret: string,
): string {
  const token = generateBookingToken(applicationId, secret)
  return `${baseUrl}/interview/book?token=${encodeURIComponent(token)}`
}
