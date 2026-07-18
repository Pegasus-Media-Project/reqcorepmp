import { and, eq } from 'drizzle-orm'
import { interviewSlot } from '../../database/schema'
import { slotIdParamSchema } from '../../utils/schemas/interviewSlot'

/**
 * DELETE /api/interview-slots/:id
 * Remove a slot. If it already has bookings, it is soft-cancelled (status =
 * 'cancelled') to preserve the booking/interview history; otherwise it is
 * hard-deleted.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['delete'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, slotIdParamSchema.parse)

  const existing = await db.query.interviewSlot.findFirst({
    where: and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)),
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }
  await assertJobInScope(session, existing.jobId)

  if (existing.bookedCount > 0) {
    await db.update(interviewSlot)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)))
    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'interview_slot',
      resourceId: id,
      metadata: { action: 'cancelled', bookedCount: existing.bookedCount },
    })
    return { success: true, cancelled: true }
  }

  await db.delete(interviewSlot)
    .where(and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)))
  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'interview_slot',
    resourceId: id,
    metadata: {},
  })
  return { success: true, deleted: true }
})
