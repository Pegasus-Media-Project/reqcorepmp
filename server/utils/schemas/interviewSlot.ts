import { z } from 'zod'

// ─────────────────────────────────────────────
// Interview slot validation schemas (candidate self-scheduling)
// ─────────────────────────────────────────────

const interviewTypes = ['phone', 'video', 'in_person', 'panel', 'technical', 'take_home'] as const
const slotStatuses = ['open', 'closed', 'cancelled'] as const

/** Recruiter: create a bookable interview slot for a job. */
export const createInterviewSlotSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  title: z.string().min(1, 'Title is required').max(200),
  type: z.enum(interviewTypes).default('video'),
  startsAt: z.string().datetime({ message: 'Valid ISO 8601 datetime required' }),
  duration: z.number().int().min(5).max(480).default(60),
  timezone: z.string().max(100).default('UTC'),
  location: z.string().max(500).optional(),
  interviewers: z.array(z.string().max(200)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  capacity: z.number().int().min(1).max(100).default(1),
}).refine(
  data => new Date(data.startsAt) > new Date(),
  { message: 'Slot start must be in the future', path: ['startsAt'] },
)

/** Recruiter: update a slot (reschedule, adjust capacity, open/close/cancel). */
export const updateInterviewSlotSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(interviewTypes).optional(),
  startsAt: z.string().datetime().optional(),
  duration: z.number().int().min(5).max(480).optional(),
  timezone: z.string().max(100).optional(),
  location: z.string().max(500).nullish(),
  interviewers: z.array(z.string().max(200)).max(20).nullish(),
  notes: z.string().max(5000).nullish(),
  capacity: z.number().int().min(1).max(100).optional(),
  status: z.enum(slotStatuses).optional(),
}).refine(
  data => !data.startsAt || new Date(data.startsAt) > new Date(),
  { message: 'Slot start must be in the future', path: ['startsAt'] },
)

/** Recruiter: list slots for a job. */
export const slotQuerySchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
})

/** Reusable `:id` route param for a slot. */
export const slotIdParamSchema = z.object({
  id: z.string().min(1),
})

/** Recruiter: send a booking invitation to an application. */
export const sendSlotInvitationSchema = z.object({
  templateId: z.string().optional(),
  customSubject: z.string().max(300).optional(),
  customBody: z.string().max(20000).optional(),
})

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Recruiter: job-level availability (length + windows) for self-scheduling. */
export const jobAvailabilitySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).default('Interview'),
  type: z.enum(interviewTypes).default('video'),
  duration: z.number().int().min(5).max(480).default(60),
  timezone: z.string().min(1).max(100),
  location: z.string().max(500).nullish(),
  capacity: z.number().int().min(1).max(100).default(1),
  dateFrom: z.string().regex(YMD, 'Use YYYY-MM-DD'),
  dateTo: z.string().regex(YMD, 'Use YYYY-MM-DD'),
  /** Legacy weekday mode; ignored when `dates` is provided. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /**
   * Explicit dates to offer — only these get slots. Each may override the
   * default daily window.
   */
  dates: z.array(z.object({
    date: z.string().regex(YMD, 'Use YYYY-MM-DD'),
    windowStart: z.string().regex(HHMM, 'Use 24h HH:MM').optional(),
    windowEnd: z.string().regex(HHMM, 'Use 24h HH:MM').optional(),
  })).max(92, 'Select at most 92 dates').optional(),
  windowStart: z.string().regex(HHMM, 'Use 24h HH:MM'),
  windowEnd: z.string().regex(HHMM, 'Use 24h HH:MM'),
  breakStart: z.string().regex(HHMM, 'Use 24h HH:MM').nullish(),
  breakEnd: z.string().regex(HHMM, 'Use 24h HH:MM').nullish(),
  buffer: z.number().int().min(0).max(120).default(0),
  /** System template id or custom emailTemplate id; null = built-in default. */
  invitationTemplateId: z.string().max(100).nullish(),
  /**
   * What happens to existing FUTURE, UNBOOKED slots:
   * replace-auto (default) = replace auto-generated ones, keep manual;
   * replace-all = remove all prior open times; keep = only add new times.
   */
  priorMode: z.enum(['replace-auto', 'replace-all', 'keep']).default('replace-auto'),
  /**
   * What happens to future slots someone already booked:
   * keep (default) = leave them untouched; rebook = cancel those interviews
   * and email each candidate a new time-picker link.
   */
  bookedAction: z.enum(['keep', 'rebook']).default('keep'),
}).refine(d => d.dateFrom <= d.dateTo, { message: 'End date must be on or after the start date', path: ['dateTo'] })
  .refine(d => d.windowStart < d.windowEnd, { message: 'Window end must be after its start', path: ['windowEnd'] })
  .refine((d) => {
    const [sh, sm] = d.windowStart.split(':').map(Number)
    const [eh, em] = d.windowEnd.split(':').map(Number)
    return (eh! * 60 + em!) - (sh! * 60 + sm!) >= d.duration
  }, { message: 'The daily window must fit at least one interview', path: ['windowEnd'] })
  .refine(d => !!d.breakStart === !!d.breakEnd, { message: 'Set both break times or neither', path: ['breakEnd'] })
  .refine(d => !d.breakStart || !d.breakEnd || d.breakStart < d.breakEnd, { message: 'Break end must be after its start', path: ['breakEnd'] })
  .refine(d => (d.dates?.length ?? 0) > 0 || d.daysOfWeek.length > 0, { message: 'Select at least one date', path: ['dates'] })
  .superRefine((d, ctx) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    for (const entry of d.dates ?? []) {
      const start = entry.windowStart ?? d.windowStart
      const end = entry.windowEnd ?? d.windowEnd
      if (start >= end) {
        ctx.addIssue({ code: 'custom', message: `${entry.date}: the window end must be after its start`, path: ['dates'] })
      }
      else if (toMin(end) - toMin(start) < d.duration) {
        ctx.addIssue({ code: 'custom', message: `${entry.date}: the window is shorter than one interview`, path: ['dates'] })
      }
    }
  })

/**
 * Recruiter: reschedule an interview onto an open block, or onto a one-off
 * time (which materializes a matching block). Exactly one of slotId/startsAt.
 */
export const rescheduleInterviewSchema = z.object({
  slotId: z.string().min(1).optional(),
  startsAt: z.string().datetime({ message: 'Valid ISO 8601 datetime required' }).optional(),
  duration: z.number().int().min(5).max(480).optional(),
  timezone: z.string().max(100).optional(),
}).refine(d => !!d.slotId !== !!d.startsAt, { message: 'Provide either a slot or a one-off time' })
  .refine(d => !d.startsAt || new Date(d.startsAt) > new Date(), { message: 'The new time must be in the future', path: ['startsAt'] })

/** Public: token identifies the invited application. */
export const publicSlotsQuerySchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

/** Public: book a specific slot with the invitation token. */
export const bookSlotSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  slotId: z.string().min(1, 'Slot is required'),
})
