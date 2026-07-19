import { describe, it, expect } from 'vitest'
import {
  generateSlotStartTimes,
  zonedTimeToUtc,
  MAX_GENERATED_SLOTS,
  type AvailabilityWindowConfig,
} from '../../server/utils/interview-availability'

const PAST = new Date('2020-01-01T00:00:00Z')

function cfg(overrides: Partial<AvailabilityWindowConfig> = {}): AvailabilityWindowConfig {
  return {
    duration: 60,
    timezone: 'America/New_York',
    dateFrom: '2026-07-20', // a Monday
    dateTo: '2026-07-24', // Friday
    daysOfWeek: [1, 2, 3, 4, 5],
    windowStart: '09:00',
    windowEnd: '17:00',
    ...overrides,
  }
}

describe('zonedTimeToUtc', () => {
  it('converts EDT (summer) wall time', () => {
    expect(zonedTimeToUtc('2026-07-20', '09:00', 'America/New_York').toISOString())
      .toBe('2026-07-20T13:00:00.000Z') // UTC-4
  })

  it('converts EST (winter) wall time', () => {
    expect(zonedTimeToUtc('2026-01-20', '09:00', 'America/New_York').toISOString())
      .toBe('2026-01-20T14:00:00.000Z') // UTC-5
  })

  it('handles UTC directly', () => {
    expect(zonedTimeToUtc('2026-07-20', '09:30', 'UTC').toISOString())
      .toBe('2026-07-20T09:30:00.000Z')
  })

  it('is correct across the spring-forward DST day', () => {
    // US DST starts 2026-03-08; 09:00 EDT = 13:00 UTC that day.
    expect(zonedTimeToUtc('2026-03-08', '09:00', 'America/New_York').toISOString())
      .toBe('2026-03-08T13:00:00.000Z')
  })
})

describe('generateSlotStartTimes', () => {
  it('generates duration-stepped starts within the daily window', () => {
    const times = generateSlotStartTimes(cfg({ dateTo: '2026-07-20' }), PAST)
    // 09:00–17:00 with 60-min interviews → 8 starts (09:00 … 16:00)
    expect(times).toHaveLength(8)
    expect(times[0]!.toISOString()).toBe('2026-07-20T13:00:00.000Z')
    expect(times[7]!.toISOString()).toBe('2026-07-20T20:00:00.000Z')
  })

  it('excludes a start whose interview would overrun the window', () => {
    const times = generateSlotStartTimes(cfg({ dateTo: '2026-07-20', duration: 45 }), PAST)
    // 45-min steps from 09:00; last fit ends ≤ 17:00 → 16:30 start would end 17:15, excluded.
    const last = times[times.length - 1]!
    expect(last.toISOString()).toBe('2026-07-20T19:45:00.000Z') // 15:45 ET
  })

  it('skips days not in daysOfWeek', () => {
    // Window spans Mon–Fri but only Wednesdays (3) are offered.
    const times = generateSlotStartTimes(cfg({ daysOfWeek: [3] }), PAST)
    expect(times).toHaveLength(8)
    for (const t of times) {
      expect(t.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })).toBe('Wed')
    }
  })

  it('filters out past times relative to `now`', () => {
    const now = new Date('2026-07-22T15:30:00Z') // Wed 11:30 ET
    const times = generateSlotStartTimes(cfg(), now)
    expect(times[0]!.getTime()).toBeGreaterThan(now.getTime())
    expect(times[0]!.toISOString()).toBe('2026-07-22T16:00:00.000Z') // Wed 12:00 ET
  })

  it('returns nothing for a window smaller than the duration', () => {
    expect(generateSlotStartTimes(cfg({ windowStart: '09:00', windowEnd: '09:30' }), PAST)).toHaveLength(0)
    expect(generateSlotStartTimes(cfg({ duration: 0 }), PAST)).toHaveLength(0)
  })

  it('caps the total at MAX_GENERATED_SLOTS', () => {
    const times = generateSlotStartTimes(cfg({ dateFrom: '2026-01-01', dateTo: '2026-12-31', duration: 15 }), PAST)
    expect(times).toHaveLength(MAX_GENERATED_SLOTS)
  })

  it('keeps wall-clock times stable across a DST transition', () => {
    // Fri 2026-03-06 (EST, UTC-5) and Mon 2026-03-09 (EDT, UTC-4) both offer 09:00 local.
    const times = generateSlotStartTimes(
      cfg({ dateFrom: '2026-03-06', dateTo: '2026-03-09', daysOfWeek: [1, 5], windowEnd: '10:00' }),
      PAST,
    )
    expect(times.map(t => t.toISOString())).toEqual([
      '2026-03-06T14:00:00.000Z', // 09:00 EST
      '2026-03-09T13:00:00.000Z', // 09:00 EDT
    ])
  })
})
