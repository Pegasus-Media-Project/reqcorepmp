import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { interviewSlot } from '../../database/schema'
import { listSlotBookings, cancelSlotBookings } from '../../utils/slot-scheduling'

const bulkDeleteSchema = z.object({
  slotIds: z.array(z.string().min(1)).min(1, 'Select at least one slot').max(300),
  /** How to treat slots that have assignees. Default: leave them untouched. */
  bookedMode: z.enum(['skip', 'cancel-interviews']).default('skip'),
})

/**
 * POST /api/interview-slots/bulk-delete  { slotIds, bookedMode }
 *
 * Remove several slots at once. Empty slots are hard-deleted. Slots with
 * assignees are skipped (default) or have their bookings + interviews
 * cancelled with candidate emails (bookedMode = 'cancel-interviews'), in which
 * case the slot is soft-cancelled to keep history.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['delete'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const body = await readValidatedBody(event, bulkDeleteSchema.parse)

  const slots = await db.query.interviewSlot.findMany({
    where: and(
      inArray(interviewSlot.id, body.slotIds),
      eq(interviewSlot.organizationId, orgId),
    ),
    columns: { id: true, jobId: true, bookedCount: true },
  })

  // Slots are job-scoped; check access per distinct job.
  for (const jobId of new Set(slots.map(s => s.jobId))) {
    await assertJobInScope(session, jobId)
  }

  let deleted = 0
  let cancelled = 0
  let skippedBooked = 0
  let cancelledInterviews = 0

  for (const slot of slots) {
    const bookings = slot.bookedCount > 0 ? await listSlotBookings(orgId, slot.id) : []
    if (bookings.length) {
      if (body.bookedMode === 'skip') {
        skippedBooked++
        continue
      }
      await cancelSlotBookings({ orgId, slotId: slot.id })
      await db.update(interviewSlot)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(interviewSlot.id, slot.id), eq(interviewSlot.organizationId, orgId)))
      cancelled++
      cancelledInterviews += bookings.length
      continue
    }
    await db.delete(interviewSlot)
      .where(and(eq(interviewSlot.id, slot.id), eq(interviewSlot.organizationId, orgId)))
    deleted++
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'interview_slot',
    resourceId: body.slotIds[0]!,
    metadata: { action: 'bulk_delete', requested: body.slotIds.length, deleted, cancelled, skippedBooked, cancelledInterviews },
  })

  return { success: true, deleted, cancelled, skippedBooked, cancelledInterviews }
})
