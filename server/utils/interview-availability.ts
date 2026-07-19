/**
 * Slot generation from job-level interview availability.
 *
 * Pure date math — no DB access — so it can be unit-tested directly. The PUT
 * endpoint feeds the stored config in and bulk-inserts the returned instants
 * as `interviewSlot` rows.
 */

export interface AvailabilityDateEntry {
  /** 'YYYY-MM-DD' in the config's timezone. */
  date: string
  /** Per-date window override; falls back to the config's default window. */
  windowStart?: string
  windowEnd?: string
}

export interface AvailabilityWindowConfig {
  /** Interview length in minutes; also the step between start times. */
  duration: number
  /** IANA timezone the window times are expressed in. */
  timezone: string
  /** First and last calendar day offered, inclusive, as 'YYYY-MM-DD' in `timezone`. */
  dateFrom: string
  dateTo: string
  /** Days of week offered: 0 = Sunday … 6 = Saturday (legacy weekday mode). */
  daysOfWeek: number[]
  /**
   * Explicit dates to offer — when non-empty this supersedes the
   * dateFrom/dateTo × daysOfWeek sweep: ONLY these dates get slots, each
   * optionally with its own window.
   */
  dates?: AvailabilityDateEntry[] | null
  /** Default daily window, 24h 'HH:MM' strings in `timezone`. */
  windowStart: string
  windowEnd: string
  /** Optional daily break (e.g. lunch) — no slot may overlap it. */
  breakStart?: string | null
  breakEnd?: string | null
  /** Gap in minutes between consecutive interviews. Default 0. */
  buffer?: number
}

/** Hard cap on slots produced by one generation run. */
export const MAX_GENERATED_SLOTS = 300

/** Minutes since midnight for an 'HH:MM' string. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * The UTC offset (ms) of `timezone` at the given UTC instant.
 * Uses Intl to reconstruct the wall-clock time and diff it against UTC.
 */
function tzOffsetMs(instant: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value
  // 'hour' can be '24' at midnight in some ICU versions — normalize.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour)
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  )
  return asUtc - instant.getTime()
}

/**
 * Convert a wall-clock time ('YYYY-MM-DD' + 'HH:MM') in `timezone` to a UTC
 * Date. Two-pass offset lookup handles DST transitions: the first guess uses
 * the offset at the naive instant, the second corrects it if the transition
 * falls between the two.
 */
export function zonedTimeToUtc(dateStr: string, hhmm: string, timezone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y!, mo! - 1, d!, h ?? 0, mi ?? 0, 0)
  let utc = naive - tzOffsetMs(new Date(naive), timezone)
  utc = naive - tzOffsetMs(new Date(utc), timezone)
  return new Date(utc)
}

/** Day of week (0–6, Sunday = 0) of a 'YYYY-MM-DD' string, timezone-agnostic. */
function dayOfWeek(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay()
}

/** The next calendar day as 'YYYY-MM-DD'. */
function nextDay(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y!, mo! - 1, d! + 1))
  return next.toISOString().slice(0, 10)
}

/**
 * The bookable segments of one day, in minutes-since-midnight, for the given
 * window. Without a break this is the whole window; with one, the window is
 * split around it so slots resume exactly at break end.
 */
function daySegments(cfg: AvailabilityWindowConfig, windowStart: string, windowEnd: string): Array<[number, number]> {
  const startMin = toMinutes(windowStart)
  const endMin = toMinutes(windowEnd)
  if (!cfg.breakStart || !cfg.breakEnd) return [[startMin, endMin]]
  const bStart = Math.max(startMin, toMinutes(cfg.breakStart))
  const bEnd = Math.min(endMin, toMinutes(cfg.breakEnd))
  if (bEnd <= bStart) return [[startMin, endMin]]
  return [[startMin, bStart], [bEnd, endMin]]
}

/**
 * All future slot start instants for the given availability config, ascending,
 * capped at MAX_GENERATED_SLOTS. Within each bookable segment of a day, start
 * times step by `duration + buffer`; a slot is included only if the interview
 * fits inside the segment and starts after `now`.
 *
 * Days come from `dates` (explicit per-date mode, each date optionally with
 * its own window) when non-empty, otherwise from the dateFrom/dateTo ×
 * daysOfWeek sweep.
 */
export function generateSlotStartTimes(cfg: AvailabilityWindowConfig, now: Date = new Date()): Date[] {
  const out: Date[] = []
  if (cfg.duration <= 0) return out
  const step = cfg.duration + Math.max(0, cfg.buffer ?? 0)

  // Resolve the day list: explicit dates, or the legacy weekday sweep.
  let days: Array<{ date: string, windowStart: string, windowEnd: string }>
  if (cfg.dates?.length) {
    days = [...cfg.dates]
      .sort((a, b) => a.date < b.date ? -1 : 1)
      .map(d => ({
        date: d.date,
        windowStart: d.windowStart ?? cfg.windowStart,
        windowEnd: d.windowEnd ?? cfg.windowEnd,
      }))
  }
  else {
    const wanted = new Set(cfg.daysOfWeek)
    days = []
    for (let day = cfg.dateFrom; day <= cfg.dateTo; day = nextDay(day)) {
      if (!wanted.has(dayOfWeek(day))) continue
      days.push({ date: day, windowStart: cfg.windowStart, windowEnd: cfg.windowEnd })
    }
  }

  for (const day of days) {
    const segments = daySegments(cfg, day.windowStart, day.windowEnd).filter(([s, e]) => e - s >= cfg.duration)
    for (const [segStart, segEnd] of segments) {
      for (let m = segStart; m + cfg.duration <= segEnd; m += step) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        const startsAt = zonedTimeToUtc(day.date, `${hh}:${mm}`, cfg.timezone)
        if (startsAt <= now) continue
        out.push(startsAt)
        if (out.length >= MAX_GENERATED_SLOTS) return out
      }
    }
  }
  return out
}
