import { and, eq, gt, inArray } from 'drizzle-orm'
import {
  interview, interviewSlot, interviewSlotSignup, reviewerSlotAvailability,
} from '../database/schema'
import { user } from '../database/schema/auth'

/**
 * Reviewer interview signup: members and guest reviewers assign THEMSELVES as
 * interviewers on a job's slots — either per-slot (Join) or by declaring
 * availability ranges that auto-assign them to every slot the range covers.
 *
 * Assignments live in `interviewSlotSignup`; the slot's free-text
 * `interviewers` array stays the staff-managed source of truth for manually
 * typed names. Wherever an interview is materialized or a signup changes, the
 * displayed interviewer list is recomputed as manual names + signup names.
 */

export interface TimeRange {
  startsAt: Date
  endsAt: Date
}

/** Max reviewers that may sign up for one slot. */
export const MAX_SIGNUPS_PER_SLOT = 20

/**
 * True when the interview fits entirely inside at least one range:
 * range.startsAt ≤ slot start AND slot end ≤ range.endsAt.
 */
export function slotWithinRanges(startsAt: Date, durationMinutes: number, ranges: TimeRange[]): boolean {
  const start = startsAt.getTime()
  const end = start + durationMinutes * 60_000
  return ranges.some(r => r.startsAt.getTime() <= start && end <= r.endsAt.getTime())
}

/** Manual names + signup names, deduped case-insensitively, order preserved. */
export function mergeInterviewerNames(manual: string[] | null | undefined, signupNames: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of [...(manual ?? []), ...signupNames]) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/** The display names of everyone signed up for a slot. */
export async function getSlotSignupNames(orgId: string, slotId: string): Promise<string[]> {
  const rows = await db.select({ name: user.name })
    .from(interviewSlotSignup)
    .innerJoin(user, eq(interviewSlotSignup.userId, user.id))
    .where(and(
      eq(interviewSlotSignup.organizationId, orgId),
      eq(interviewSlotSignup.slotId, slotId),
    ))
    .orderBy(interviewSlotSignup.createdAt)
  return rows.map(r => r.name)
}

/**
 * Recompute a slot's merged interviewer list and write it onto every FUTURE
 * scheduled interview materialized from it, so signups made after a candidate
 * booked still reach the interview record (and its emails/exports).
 */
export async function syncSlotInterviewers(orgId: string, slotId: string): Promise<void> {
  const slot = await db.query.interviewSlot.findFirst({
    where: and(eq(interviewSlot.id, slotId), eq(interviewSlot.organizationId, orgId)),
    columns: { id: true, interviewers: true },
  })
  if (!slot) return

  const merged = mergeInterviewerNames(slot.interviewers, await getSlotSignupNames(orgId, slotId))
  await db.update(interview)
    .set({ interviewers: merged.length ? merged : null, updatedAt: new Date() })
    .where(and(
      eq(interview.organizationId, orgId),
      eq(interview.slotId, slotId),
      eq(interview.status, 'scheduled'),
      gt(interview.scheduledAt, new Date()),
    ))
}

/**
 * Auto-assign reviewers to slots from their stored availability ranges.
 * Considers only future, non-cancelled slots; existing signups (either source)
 * are left untouched via ON CONFLICT DO NOTHING. Pass `slotIds` to restrict to
 * freshly created slots, otherwise the whole job is swept.
 * Returns the ids of slots that gained at least one signup.
 */
export async function applyAvailabilitySignups(params: {
  orgId: string
  jobId: string
  slotIds?: string[]
  /** Restrict to one reviewer (used when that reviewer saves their ranges). */
  userId?: string
}): Promise<string[]> {
  const { orgId, jobId, slotIds, userId } = params

  const availabilities = await db.query.reviewerSlotAvailability.findMany({
    where: and(
      eq(reviewerSlotAvailability.organizationId, orgId),
      eq(reviewerSlotAvailability.jobId, jobId),
      ...(userId ? [eq(reviewerSlotAvailability.userId, userId)] : []),
    ),
  })
  if (!availabilities.length) return []

  const slots = await db.query.interviewSlot.findMany({
    where: and(
      eq(interviewSlot.organizationId, orgId),
      eq(interviewSlot.jobId, jobId),
      inArray(interviewSlot.status, ['open', 'closed']),
      gt(interviewSlot.startsAt, new Date()),
      ...(slotIds?.length ? [inArray(interviewSlot.id, slotIds)] : []),
    ),
    columns: { id: true, startsAt: true, duration: true },
  })
  if (!slots.length) return []

  const rangesByUser = new Map<string, TimeRange[]>()
  for (const a of availabilities) {
    const list = rangesByUser.get(a.userId) ?? []
    list.push({ startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt) })
    rangesByUser.set(a.userId, list)
  }

  const values: Array<{ organizationId: string, slotId: string, userId: string, source: 'availability' }> = []
  for (const slot of slots) {
    for (const [uid, ranges] of rangesByUser) {
      if (slotWithinRanges(new Date(slot.startsAt), slot.duration, ranges)) {
        values.push({ organizationId: orgId, slotId: slot.id, userId: uid, source: 'availability' })
      }
    }
  }
  if (!values.length) return []

  const inserted = await db.insert(interviewSlotSignup)
    .values(values)
    .onConflictDoNothing()
    .returning({ slotId: interviewSlotSignup.slotId })

  const changed = [...new Set(inserted.map(r => r.slotId))]
  for (const slotId of changed) {
    await syncSlotInterviewers(orgId, slotId)
  }
  return changed
}

/**
 * Replace one reviewer's availability ranges for a job: store the new ranges,
 * auto-assign matching future slots, and withdraw availability-sourced signups
 * on future slots the new ranges no longer cover. Manual signups are never
 * touched, and past slots are left as history.
 * Returns how many future slots the reviewer is now signed up for via ranges.
 */
export async function replaceReviewerAvailability(params: {
  orgId: string
  jobId: string
  userId: string
  ranges: TimeRange[]
}): Promise<{ assignedSlots: number }> {
  const { orgId, jobId, userId, ranges } = params

  await db.transaction(async (tx) => {
    await tx.delete(reviewerSlotAvailability).where(and(
      eq(reviewerSlotAvailability.organizationId, orgId),
      eq(reviewerSlotAvailability.jobId, jobId),
      eq(reviewerSlotAvailability.userId, userId),
    ))
    if (ranges.length) {
      await tx.insert(reviewerSlotAvailability).values(ranges.map(r => ({
        organizationId: orgId,
        jobId,
        userId,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      })))
    }
  })

  // Withdraw availability signups on future slots no longer covered.
  const existing = await db.select({
    signupId: interviewSlotSignup.id,
    slotId: interviewSlot.id,
    startsAt: interviewSlot.startsAt,
    duration: interviewSlot.duration,
  })
    .from(interviewSlotSignup)
    .innerJoin(interviewSlot, eq(interviewSlotSignup.slotId, interviewSlot.id))
    .where(and(
      eq(interviewSlotSignup.organizationId, orgId),
      eq(interviewSlotSignup.userId, userId),
      eq(interviewSlotSignup.source, 'availability'),
      eq(interviewSlot.jobId, jobId),
      gt(interviewSlot.startsAt, new Date()),
    ))
  const stale = existing.filter(s => !slotWithinRanges(new Date(s.startsAt), s.duration, ranges))
  if (stale.length) {
    await db.delete(interviewSlotSignup)
      .where(inArray(interviewSlotSignup.id, stale.map(s => s.signupId)))
    for (const s of stale) {
      await syncSlotInterviewers(orgId, s.slotId)
    }
  }

  await applyAvailabilitySignups({ orgId, jobId, userId })

  const current = await db.select({ id: interviewSlotSignup.id })
    .from(interviewSlotSignup)
    .innerJoin(interviewSlot, eq(interviewSlotSignup.slotId, interviewSlot.id))
    .where(and(
      eq(interviewSlotSignup.organizationId, orgId),
      eq(interviewSlotSignup.userId, userId),
      eq(interviewSlotSignup.source, 'availability'),
      eq(interviewSlot.jobId, jobId),
      gt(interviewSlot.startsAt, new Date()),
    ))
  return { assignedSlots: current.length }
}
