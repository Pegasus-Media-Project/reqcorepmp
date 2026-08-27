import { and, eq } from 'drizzle-orm'
import { interviewSlot, interviewSlotSignup } from '../../../database/schema'
import { slotIdParamSchema } from '../../../utils/schemas/interviewSlot'
import { syncSlotInterviewers, withdrawSlotReviewerAssignments } from '../../../utils/reviewer-signup'

/**
 * DELETE /api/interview-slots/:id/signup
 * The caller withdraws their own interviewer signup from a slot (whether it
 * was manual or availability-derived).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, slotIdParamSchema.parse)

  const slot = await db.query.interviewSlot.findFirst({
    where: and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)),
    columns: { id: true, jobId: true },
  })
  if (!slot) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }
  await assertJobInScope(session, slot.jobId)

  const deleted = await db.delete(interviewSlotSignup)
    .where(and(
      eq(interviewSlotSignup.organizationId, orgId),
      eq(interviewSlotSignup.slotId, id),
      eq(interviewSlotSignup.userId, session.user.id),
    ))
    .returning({ id: interviewSlotSignup.id })

  if (deleted.length) {
    await syncSlotInterviewers(orgId, id)
    await withdrawSlotReviewerAssignments(orgId, id, session.user.id)
    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'interview_slot',
      resourceId: id,
      metadata: { action: 'interviewer_withdrew', jobId: slot.jobId },
    })
  }

  return { success: true, removed: deleted.length > 0 }
})
