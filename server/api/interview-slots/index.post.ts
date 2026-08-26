import { and, eq } from 'drizzle-orm'
import { interviewSlot, job } from '../../database/schema'
import { createInterviewSlotSchema } from '../../utils/schemas/interviewSlot'

/**
 * POST /api/interview-slots
 * Create a bookable interview slot for a job. Solo+ (`interviews`) feature.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const body = await readValidatedBody(event, createInterviewSlotSchema.parse)

  // Verify the job exists, belongs to the org, and is in scope for this member.
  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, body.jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  await assertJobInScope(session, body.jobId)

  const [created] = await db.insert(interviewSlot).values({
    organizationId: orgId,
    jobId: body.jobId,
    createdById: session.user.id,
    title: body.title,
    type: body.type,
    startsAt: new Date(body.startsAt),
    duration: body.duration,
    timezone: body.timezone,
    location: body.location ?? null,
    interviewers: body.interviewers ?? null,
    notes: body.notes ?? null,
    capacity: body.capacity,
  }).returning()

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create slot' })

  // Auto-assign reviewers whose stored availability covers the new slot.
  await applyAvailabilitySignups({ orgId, jobId: body.jobId, slotIds: [created.id] })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'interview_slot',
    resourceId: created.id,
    metadata: { jobId: body.jobId, startsAt: created.startsAt, capacity: created.capacity },
  })

  return { ...created, available: created.capacity - created.bookedCount }
})
