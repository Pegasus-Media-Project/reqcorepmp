import { and, eq } from 'drizzle-orm'
import { interviewSlot } from '../../database/schema'
import { slotQuerySchema } from '../../utils/schemas/interviewSlot'

/**
 * GET /api/interview-slots?jobId=…
 * List a job's interview slots with a computed `available` count.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { jobId } = await getValidatedQuery(event, slotQuerySchema.parse)

  await assertJobInScope(session, jobId)

  const slots = await db.query.interviewSlot.findMany({
    where: and(
      eq(interviewSlot.organizationId, orgId),
      eq(interviewSlot.jobId, jobId),
    ),
    orderBy: (s, { asc }) => [asc(s.startsAt)],
  })

  return {
    data: slots.map(s => ({ ...s, available: Math.max(0, s.capacity - s.bookedCount) })),
  }
})
