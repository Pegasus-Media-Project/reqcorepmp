import { and, eq } from 'drizzle-orm'
import { interviewSlot } from '../../database/schema'
import { slotIdParamSchema, updateInterviewSlotSchema } from '../../utils/schemas/interviewSlot'

/**
 * PATCH /api/interview-slots/:id
 * Update a slot (reschedule, adjust capacity, open/close/cancel).
 * Capacity may not be lowered below the number of confirmed bookings.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, slotIdParamSchema.parse)
  const body = await readValidatedBody(event, updateInterviewSlotSchema.parse)

  const existing = await db.query.interviewSlot.findFirst({
    where: and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)),
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }
  await assertJobInScope(session, existing.jobId)

  if (body.capacity != null && body.capacity < existing.bookedCount) {
    throw createError({
      statusCode: 422,
      statusMessage: `Capacity cannot be lower than the ${existing.bookedCount} existing booking(s).`,
    })
  }

  const [updated] = await db.update(interviewSlot)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.startsAt !== undefined ? { startsAt: new Date(body.startsAt) } : {}),
      ...(body.duration !== undefined ? { duration: body.duration } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.location !== undefined ? { location: body.location } : {}),
      ...(body.interviewers !== undefined ? { interviewers: body.interviewers } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(interviewSlot.id, id), eq(interviewSlot.organizationId, orgId)))
    .returning()

  return { ...updated!, available: Math.max(0, updated!.capacity - updated!.bookedCount) }
})
