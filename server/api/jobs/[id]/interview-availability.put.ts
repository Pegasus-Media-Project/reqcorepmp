import { and, eq, gt, inArray } from 'drizzle-orm'
import { interviewSlot, job, jobInterviewAvailability } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { jobAvailabilitySchema } from '../../../utils/schemas/interviewSlot'
import { generateSlotStartTimes, MAX_GENERATED_SLOTS } from '../../../utils/interview-availability'

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
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    breakStart: body.breakStart,
    breakEnd: body.breakEnd,
    buffer: body.buffer,
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
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      breakStart: body.breakStart ?? null,
      breakEnd: body.breakEnd ?? null,
      buffer: body.buffer,
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

    // Replace future generated slots that nobody has booked.
    const removable = await tx.select({ id: interviewSlot.id })
      .from(interviewSlot)
      .where(and(
        eq(interviewSlot.jobId, id),
        eq(interviewSlot.organizationId, orgId),
        eq(interviewSlot.generated, true),
        eq(interviewSlot.bookedCount, 0),
        gt(interviewSlot.startsAt, new Date()),
      ))
    if (removable.length) {
      await tx.delete(interviewSlot).where(inArray(interviewSlot.id, removable.map(r => r.id)))
    }

    // Skip new times that collide with a kept slot (manual or booked).
    const kept = await tx.select({ startsAt: interviewSlot.startsAt })
      .from(interviewSlot)
      .where(and(
        eq(interviewSlot.jobId, id),
        eq(interviewSlot.organizationId, orgId),
        gt(interviewSlot.startsAt, new Date()),
      ))
    const taken = new Set(kept.map(k => new Date(k.startsAt).getTime()))
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

    return { availability, created: fresh.length, removed: removable.length }
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: { action: 'interview_availability_saved', created: result.created, removed: result.removed },
  })

  return {
    ...result,
    truncated: startTimes.length >= MAX_GENERATED_SLOTS,
  }
})
