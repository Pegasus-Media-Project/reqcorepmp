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

  it('skips slots that would overlap the daily break and resumes at break end', () => {
    // 09:00–14:00, 60-min interviews, lunch 12:00–12:30.
    const times = generateSlotStartTimes(
      cfg({ dateTo: '2026-07-20', windowEnd: '14:00', breakStart: '12:00', breakEnd: '12:30' }),
      PAST,
    ).map(t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    // Morning segment 09:00–12:00 → 09,10,11; afternoon resumes at 12:30 → 12:30, 13:00 would overrun? 12:30+60=13:30 ≤ 14:00 ✓; next 13:30+60 > 14:00.
    expect(times).toEqual(['09:00', '10:00', '11:00', '12:30'])
  })

  it('adds the buffer between consecutive interviews', () => {
    // 09:00–11:00, 30-min interviews with a 10-min buffer → 09:00, 09:40, 10:20.
    const times = generateSlotStartTimes(
      cfg({ dateTo: '2026-07-20', windowEnd: '11:00', duration: 30, buffer: 10 }),
      PAST,
    ).map(t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    expect(times).toEqual(['09:00', '09:40', '10:20'])
  })

  it('combines break and buffer', () => {
    // 09:00–13:00, 45-min + 15 buffer, break 10:30–11:00 → 09:00; 10:00 won't fit before break (ends 10:45) → afternoon 11:00, 12:00.
    const times = generateSlotStartTimes(
      cfg({ dateTo: '2026-07-20', windowEnd: '13:00', duration: 45, buffer: 15, breakStart: '10:30', breakEnd: '11:00' }),
      PAST,
    ).map(t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    expect(times).toEqual(['09:00', '11:00', '12:00'])
  })

  it('ignores a break outside the window', () => {
    const withBreak = generateSlotStartTimes(
      cfg({ dateTo: '2026-07-20', breakStart: '18:00', breakEnd: '19:00' }),
      PAST,
    )
    const without = generateSlotStartTimes(cfg({ dateTo: '2026-07-20' }), PAST)
    expect(withBreak).toEqual(without)
  })

  it('explicit dates: only the given dates get slots', () => {
    const times = generateSlotStartTimes(
      cfg({ dates: [{ date: '2026-07-20' }, { date: '2026-07-23' }], windowEnd: '11:00' }),
      PAST,
    )
    const dates = new Set(times.map(t => t.toISOString().slice(0, 10)))
    expect([...dates].sort()).toEqual(['2026-07-20', '2026-07-23'])
    // daysOfWeek is ignored in dates mode — Thursday (4) not in cfg's [1-5]? it is;
    // use a Sunday to prove it: explicitly offered dates win over weekday filters.
    const sunday = generateSlotStartTimes(
      cfg({ dates: [{ date: '2026-07-26' }], daysOfWeek: [1], windowEnd: '10:00' }),
      PAST,
    )
    expect(sunday.length).toBeGreaterThan(0)
    expect(sunday[0]!.toISOString().slice(0, 10)).toBe('2026-07-26')
  })

  it('explicit dates: per-date windows override the default', () => {
    const times = generateSlotStartTimes(
      cfg({
        dates: [
          { date: '2026-07-20' }, // default window 09:00–17:00
          { date: '2026-07-21', windowStart: '14:00', windowEnd: '16:00' },
        ],
      }),
      PAST,
    ).map(t => t.toISOString())
    // Monday: 8 hourly starts from 13:00Z; Tuesday: only 18:00Z and 19:00Z (14:00/15:00 ET).
    expect(times.filter(t => t.startsWith('2026-07-20'))).toHaveLength(8)
    expect(times.filter(t => t.startsWith('2026-07-21'))).toEqual([
      '2026-07-21T18:00:00.000Z',
      '2026-07-21T19:00:00.000Z',
    ])
  })

  it('explicit dates: break and buffer still apply', () => {
    const times = generateSlotStartTimes(
      cfg({
        dates: [{ date: '2026-07-20', windowStart: '09:00', windowEnd: '12:00' }],
        duration: 30,
        buffer: 15,
        breakStart: '10:00',
        breakEnd: '10:30',
      }),
      PAST,
    ).map(t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    // Morning segment 09:00–10:00: 09:00 (09:45 next start won't fit before 10:00).
    // After the break 10:30–12:00: 10:30, 11:15.
    expect(times).toEqual(['09:00', '10:30', '11:15'])
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
