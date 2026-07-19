import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { interviewSlot } from '../../database/schema'
import { slotIdParamSchema } from '../../utils/schemas/interviewSlot'
import { listSlotBookings, cancelSlotBookings } from '../../utils/slot-scheduling'

const deleteQuerySchema = z.object({
  /** Required when the slot has assignees: confirms cancelling their interviews. */
  mode: z.enum(['cancel-interviews']).optional(),
})

/**
 * DELETE /api/interview-slots/:id[?mode=cancel-interviews]
 *
 * Remove a slot. Empty slots are hard-deleted. A slot with assignees is
 * refused with 409 + the booking list, so the UI can ask whether to cancel
 * those interviews (retry with mode=cancel-interviews — cancels the bookings
 * and interviews, emails the candidates, and soft-cancels the slot to keep
 * history) or move the candidates via reschedule instead.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['delete'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, slotIdParamSchema.parse)
  const { mode } = await getValidatedQuery(event, deleteQuerySchema.parse)

  const existing = await db.query.interviewSlot.findFirst({
    where: and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)),
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }
  await assertJobInScope(session, existing.jobId)

  const bookings = await listSlotBookings(orgId, id)

  if (bookings.length && mode !== 'cancel-interviews') {
    throw createError({
      statusCode: 409,
      statusMessage: `This time has ${bookings.length} candidate${bookings.length === 1 ? '' : 's'} assigned.`,
      data: { bookings },
    })
  }

  if (bookings.length) {
    // Cancel the assignees' bookings + interviews, then keep the slot as a
    // cancelled record.
    await cancelSlotBookings({ orgId, slotId: id })
    await db.update(interviewSlot)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)))
    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'interview_slot',
      resourceId: id,
      metadata: { action: 'cancelled_with_interviews', cancelledInterviews: bookings.length },
    })
    return { success: true, cancelled: true, cancelledInterviews: bookings.length }
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
