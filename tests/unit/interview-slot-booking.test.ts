import { describe, it, expect } from 'vitest'
import {
  generateBookingToken,
  verifyBookingToken,
  buildBookingUrl,
  generateInterviewToken,
  verifyInterviewToken,
} from '../../server/utils/interview-token'
import { APPLICATION_STATUS_TRANSITIONS } from '../../shared/status-transitions'
import { bookSlotSchema, createInterviewSlotSchema, updateInterviewSlotSchema } from '../../server/utils/schemas/interviewSlot'

const SECRET = 'test-secret'
const APP_ID = '3f8b0a52-2f6a-4e0a-9a51-111111111111'

describe('slot booking tokens', () => {
  it('round-trips a valid booking token', () => {
    const token = generateBookingToken(APP_ID, SECRET)
    expect(verifyBookingToken(token, SECRET)).toEqual({ applicationId: APP_ID })
  })

  it('rejects a tampered token', () => {
    const token = generateBookingToken(APP_ID, SECRET)
    const [payload, sig] = token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ aid: 'someone-else', t: 'slot_book', exp: Date.now() + 10_000 }),
    ).toString('base64url')
    expect(verifyBookingToken(`${tamperedPayload}.${sig}`, SECRET)).toBeNull()
    expect(verifyBookingToken(`${payload}.${'0'.repeat(sig!.length)}`, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = generateBookingToken(APP_ID, 'other-secret')
    expect(verifyBookingToken(token, SECRET)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = generateBookingToken(APP_ID, SECRET, -1000)
    expect(verifyBookingToken(token, SECRET)).toBeNull()
  })

  it('rejects garbage input', () => {
    expect(verifyBookingToken('', SECRET)).toBeNull()
    expect(verifyBookingToken('not-a-token', SECRET)).toBeNull()
    expect(verifyBookingToken('a.b', SECRET)).toBeNull()
  })

  it('is not interchangeable with interview respond tokens', () => {
    // A respond token must not authorize booking…
    const respondToken = generateInterviewToken(APP_ID, 'accepted', SECRET)
    expect(verifyBookingToken(respondToken, SECRET)).toBeNull()
    // …and a booking token must not pass respond verification.
    const bookingToken = generateBookingToken(APP_ID, SECRET)
    expect(verifyInterviewToken(bookingToken, SECRET)).toBeNull()
  })

  it('builds a booking URL that carries a verifiable token', () => {
    const url = buildBookingUrl('https://pmp.example.com', APP_ID, SECRET)
    expect(url.startsWith('https://pmp.example.com/interview/book?token=')).toBe(true)
    const token = decodeURIComponent(url.split('token=')[1]!)
    expect(verifyBookingToken(token, SECRET)).toEqual({ applicationId: APP_ID })
  })
})

describe('waitlist status transitions', () => {
  it('is reachable from screening and interview', () => {
    expect(APPLICATION_STATUS_TRANSITIONS.screening).toContain('waitlist')
    expect(APPLICATION_STATUS_TRANSITIONS.interview).toContain('waitlist')
  })

  it('can be re-activated or resolved', () => {
    expect(APPLICATION_STATUS_TRANSITIONS.waitlist).toEqual(
      expect.arrayContaining(['interview', 'offer', 'rejected']),
    )
  })

  it('is not reachable from terminal or pre-screening states', () => {
    expect(APPLICATION_STATUS_TRANSITIONS.new).not.toContain('waitlist')
    expect(APPLICATION_STATUS_TRANSITIONS.hired).toEqual([])
    expect(APPLICATION_STATUS_TRANSITIONS.rejected).not.toContain('waitlist')
  })
})

describe('interview slot schemas', () => {
  it('requires a future start time on create', () => {
    const base = { jobId: 'j1', title: 'Interview', startsAt: new Date(Date.now() - 60_000).toISOString() }
    expect(createInterviewSlotSchema.safeParse(base).success).toBe(false)
    const future = { ...base, startsAt: new Date(Date.now() + 86_400_000).toISOString() }
    const parsed = createInterviewSlotSchema.safeParse(future)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.capacity).toBe(1)
      expect(parsed.data.duration).toBe(60)
    }
  })

  it('bounds capacity between 1 and 100', () => {
    const future = { jobId: 'j1', title: 'Interview', startsAt: new Date(Date.now() + 86_400_000).toISOString() }
    expect(createInterviewSlotSchema.safeParse({ ...future, capacity: 0 }).success).toBe(false)
    expect(createInterviewSlotSchema.safeParse({ ...future, capacity: 101 }).success).toBe(false)
    expect(updateInterviewSlotSchema.safeParse({ capacity: 5 }).success).toBe(true)
  })

  it('requires token and slotId to book', () => {
    expect(bookSlotSchema.safeParse({ token: 't', slotId: 's' }).success).toBe(true)
    expect(bookSlotSchema.safeParse({ token: '', slotId: 's' }).success).toBe(false)
    expect(bookSlotSchema.safeParse({ token: 't' }).success).toBe(false)
  })
})
