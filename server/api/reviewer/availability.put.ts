import { and, eq } from 'drizzle-orm'
import { job } from '../../database/schema'
import { reviewerAvailabilitySchema } from '../../utils/schemas/interviewSlot'
import { replaceReviewerAvailability } from '../../utils/reviewer-signup'

/**
 * PUT /api/reviewer/availability  { jobId, ranges: [{startsAt, endsAt}] }
 *
 * Replace the caller's interviewer availability for a job. Every future slot
 * that fits entirely inside one of the ranges auto-assigns them; future
 * availability-derived signups outside the new ranges are withdrawn (manual
 * ones stay). Ranges also apply to slots created later.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, reviewerAvailabilitySchema.parse)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, body.jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  await assertJobInScope(session, body.jobId)

  const { assignedSlots } = await replaceReviewerAvailability({
    orgId,
    jobId: body.jobId,
    userId: session.user.id,
    ranges: body.ranges.map(r => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) })),
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: body.jobId,
    metadata: { action: 'reviewer_availability_saved', ranges: body.ranges.length, assignedSlots },
  })

  return { success: true, assignedSlots }
})
