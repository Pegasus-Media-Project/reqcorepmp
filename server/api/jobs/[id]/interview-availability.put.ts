import { and, eq, gt, inArray } from 'drizzle-orm'
import { interviewSlot, job, jobInterviewAvailability } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { jobAvailabilitySchema } from '../../../utils/schemas/interviewSlot'
import { generateSlotStartTimes, MAX_GENERATED_SLOTS } from '../../../utils/interview-availability'
import { cancelSlotBookings, sendSlotInvitationForApplication } from '../../../utils/slot-scheduling'

/**
 * PUT /api/jobs/:id/interview-availability
 *
 * Upsert the job's self-scheduling availability (interview length + windows)
 * and regenerate its bookable slots: future generated-and-unbooked slots are
 * replaced by the new schedule; manual slots and any slot with a booking are
 * left untouched (new times colliding with a kept slot are skipped).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, jobAvailabilitySchema.parse)
  const bufferMinutes = body.bufferMinutes ?? body.buffer ?? 0

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  await assertJobInScope(session, id)

  const startTimes = generateSlotStartTimes({
    duration: body.duration,
    timezone: body.timezone,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    daysOfWeek: body.daysOfWeek,
    dates: body.dates,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    breakStart: body.breakStart,
    breakEnd: body.breakEnd,
    buffer: bufferMinutes,
  })

  const result = await db.transaction(async (tx) => {
    // Upsert the availability row (one per job).
    const existing = await tx.query.jobInterviewAvailability.findFirst({
      where: eq(jobInterviewAvailability.jobId, id),
      columns: { id: true },
    })
    const values = {
      title: body.title,
      type: body.type,
      duration: body.duration,
      timezone: body.timezone,
      location: body.location ?? null,
      capacity: body.capacity,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      daysOfWeek: body.daysOfWeek,
      dates: body.dates ?? null,
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      breakStart: body.breakStart ?? null,
      breakEnd: body.breakEnd ?? null,
      buffer: bufferMinutes,
      invitationTemplateId: body.invitationTemplateId ?? null,
      updatedAt: new Date(),
    }
    const [availability] = existing
      ? await tx.update(jobInterviewAvailability)
          .set(values)
          .where(eq(jobInterviewAvailability.id, existing.id))
          .returning()
      : await tx.insert(jobInterviewAvailability)
          .values({ ...values, organizationId: orgId, jobId: id })
          .returning()

    // Future slots with assignees — the rebook flow (post-commit) cancels
    // these and re-invites the candidates.
    const bookedFuture = await tx.select({ id: interviewSlot.id })
      .from(interviewSlot)
      .where(and(
        eq(interviewSlot.jobId, id),
        eq(interviewSlot.organizationId, orgId),
        gt(interviewSlot.bookedCount, 0),
        gt(interviewSlot.startsAt, new Date()),
      ))

    // Remove prior future UNBOOKED slots per the chosen mode.
    let removed = 0
    if (body.priorMode !== 'keep') {
      const removable = await tx.select({ id: interviewSlot.id })
        .from(interviewSlot)
        .where(and(
          eq(interviewSlot.jobId, id),
          eq(interviewSlot.organizationId, orgId),
          ...(body.priorMode === 'replace-auto' ? [eq(interviewSlot.generated, true)] : []),
          eq(interviewSlot.bookedCount, 0),
          gt(interviewSlot.startsAt, new Date()),
        ))
      if (removable.length) {
        await tx.delete(interviewSlot).where(inArray(interviewSlot.id, removable.map(r => r.id)))
      }
      removed = removable.length
    }

    // Skip new times that collide with a kept slot. Slots that the rebook flow
    // will cancel don't block their time in the new grid.
    const kept = await tx.select({ id: interviewSlot.id, startsAt: interviewSlot.startsAt })
      .from(interviewSlot)
      .where(and(
        eq(interviewSlot.jobId, id),
        eq(interviewSlot.organizationId, orgId),
        gt(interviewSlot.startsAt, new Date()),
      ))
    const rebooking = body.bookedAction === 'rebook' ? new Set(bookedFuture.map(b => b.id)) : new Set<string>()
    const taken = new Set(kept.filter(k => !rebooking.has(k.id)).map(k => new Date(k.startsAt).getTime()))
    const fresh = startTimes.filter(t => !taken.has(t.getTime()))

    if (fresh.length) {
      await tx.insert(interviewSlot).values(fresh.map(startsAt => ({
        organizationId: orgId,
        jobId: id,
        createdById: session.user.id,
        title: body.title,
        type: body.type,
        startsAt,
        duration: body.duration,
        timezone: body.timezone,
        location: body.location ?? null,
        capacity: body.capacity,
        generated: true,
      })))
    }

    return { availability, created: fresh.length, removed, bookedFutureIds: bookedFuture.map(b => b.id) }
  })

  // Auto-assign reviewers whose stored availability covers the regenerated
  // slot grid (idempotent — existing signups are untouched).
  await applyAvailabilitySignups({ orgId, jobId: id })

  // Rebook: cancel the booked interviews (with a heads-up email) and send each
  // affected candidate a fresh time-picker link into the new schedule.
  let rebooked = 0
  if (body.bookedAction === 'rebook' && result.bookedFutureIds.length) {
    const origin = getRequestURL(event).origin
    const affectedApplications = new Set<string>()
    for (const slotId of result.bookedFutureIds) {
      try {
        const { applicationIds } = await cancelSlotBookings({
          orgId,
          slotId,
          followUpNote: 'The interview schedule has changed — you will receive a new scheduling link shortly to pick a time that works for you.',
        })
        for (const appId of applicationIds) affectedApplications.add(appId)
        await db.update(interviewSlot)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(interviewSlot.id, slotId), eq(interviewSlot.organizationId, orgId)))
      }
      catch (err) {
        logError('slots.rebook_cancel_failed', {
          slot_id: slotId,
          error_message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    for (const applicationId of affectedApplications) {
      try {
        await sendSlotInvitationForApplication({ orgId, applicationId, origin })
        rebooked++
      }
      catch (err) {
        logError('slots.rebook_invite_failed', {
          application_id: applicationId,
          error_message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: {
      action: 'interview_availability_saved',
      created: result.created,
      removed: result.removed,
      priorMode: body.priorMode,
      bookedAction: body.bookedAction,
      rebooked,
    },
  })

  return {
    availability: result.availability,
    created: result.created,
    removed: result.removed,
    rebooked,
    truncated: startTimes.length >= MAX_GENERATED_SLOTS,
  }
})
