import { and, eq, gt } from 'drizzle-orm'
import { interviewSlot, interviewSlotSignup } from '../../../database/schema'
import { slotIdParamSchema } from '../../../utils/schemas/interviewSlot'
import { MAX_SIGNUPS_PER_SLOT, syncSlotInterviewers, reconcileSlotReviewerAssignments } from '../../../utils/reviewer-signup'

/**
 * POST /api/interview-slots/:id/signup
 * The caller signs THEMSELVES up as an interviewer for a slot. Self-scoped by
 * design: guests only hold `interview: read`, and this touches nothing but
 * their own assignment (job scope still applies).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, slotIdParamSchema.parse)

  const slot = await db.query.interviewSlot.findFirst({
    where: and(
      eq(interviewSlot.id, id),
      eq(interviewSlot.organizationId, orgId),
      gt(interviewSlot.startsAt, new Date()),
    ),
    columns: { id: true, jobId: true, status: true },
  })
  if (!slot || slot.status === 'cancelled') {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }
  await assertJobInScope(session, slot.jobId)

  const existing = await db.query.interviewSlotSignup.findMany({
    where: and(
      eq(interviewSlotSignup.organizationId, orgId),
      eq(interviewSlotSignup.slotId, id),
    ),
    columns: { id: true, userId: true, source: true },
  })
  const mine = existing.find(s => s.userId === session.user.id)
  if (mine) {
    // Joining explicitly upgrades an availability-derived signup to manual so
    // later availability edits can't silently withdraw it.
    if (mine.source !== 'manual') {
      await db.update(interviewSlotSignup)
        .set({ source: 'manual', updatedAt: new Date() })
        .where(eq(interviewSlotSignup.id, mine.id))
    }
    return { success: true, alreadySignedUp: true }
  }
  if (existing.length >= MAX_SIGNUPS_PER_SLOT) {
    throw createError({ statusCode: 422, statusMessage: 'This slot already has the maximum number of interviewers.' })
  }

  await db.insert(interviewSlotSignup)
    .values({ organizationId: orgId, slotId: id, userId: session.user.id, source: 'manual' })
    .onConflictDoNothing()
  await syncSlotInterviewers(orgId, id)
  // Assign onto any already-booked interviews of this slot + send the invite.
  await reconcileSlotReviewerAssignments(orgId, id)

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'interview_slot',
    resourceId: id,
    metadata: { action: 'interviewer_signed_up', jobId: slot.jobId },
  })

  return { success: true }
})
