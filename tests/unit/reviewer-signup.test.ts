import { describe, it, expect } from 'vitest'
import { slotWithinRanges, mergeInterviewerNames } from '../../server/utils/reviewer-signup'

const at = (iso: string) => new Date(iso)

describe('slotWithinRanges', () => {
  const ranges = [
    { startsAt: at('2026-09-01T13:00:00Z'), endsAt: at('2026-09-01T17:00:00Z') },
    { startsAt: at('2026-09-03T09:00:00Z'), endsAt: at('2026-09-03T12:00:00Z') },
  ]

  it('matches a slot fully inside a range', () => {
    expect(slotWithinRanges(at('2026-09-01T14:00:00Z'), 60, ranges)).toBe(true)
  })

  it('matches a slot exactly filling a range', () => {
    expect(slotWithinRanges(at('2026-09-03T09:00:00Z'), 180, ranges)).toBe(true)
  })

  it('rejects a slot that starts before the range', () => {
    expect(slotWithinRanges(at('2026-09-01T12:30:00Z'), 60, ranges)).toBe(false)
  })

  it('rejects a slot that runs past the range end', () => {
    expect(slotWithinRanges(at('2026-09-01T16:30:00Z'), 60, ranges)).toBe(false)
  })

  it('rejects a slot on a day with no range', () => {
    expect(slotWithinRanges(at('2026-09-02T14:00:00Z'), 60, ranges)).toBe(false)
  })

  it('checks each range independently (no accidental spanning)', () => {
    // Starts inside range 1 but only "ends" inside range 2 — must not match.
    expect(slotWithinRanges(at('2026-09-01T16:00:00Z'), 60 * 41, ranges)).toBe(false)
  })

  it('returns false with no ranges', () => {
    expect(slotWithinRanges(at('2026-09-01T14:00:00Z'), 60, [])).toBe(false)
  })
})

describe('mergeInterviewerNames', () => {
  it('appends signup names after manual names', () => {
    expect(mergeInterviewerNames(['Ana Ruiz'], ['Ben Odum'])).toEqual(['Ana Ruiz', 'Ben Odum'])
  })

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(mergeInterviewerNames(['Ana Ruiz'], ['ana ruiz', 'Ben Odum'])).toEqual(['Ana Ruiz', 'Ben Odum'])
  })

  it('trims and drops empty entries', () => {
    expect(mergeInterviewerNames(['  Ana Ruiz  ', ''], ['  '])).toEqual(['Ana Ruiz'])
  })

  it('handles null manual list', () => {
    expect(mergeInterviewerNames(null, ['Ben Odum'])).toEqual(['Ben Odum'])
  })
})
