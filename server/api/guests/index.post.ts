import { z } from 'zod'
import { inviteGuestToJobs } from '../../utils/guestInvites'

const bodySchema = z.object({
  email: z.string().email(),
  jobIds: z.array(z.string().uuid()).min(1, 'Select at least one job').max(100),
})

/**
 * POST /api/guests
 * Invite an external guest reviewer to multiple jobs at once (owner/admin only).
 * One invitation email, bound to every selected job.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { email, jobIds } = await readValidatedBody(event, bodySchema.parse)

  const result = await inviteGuestToJobs({
    event,
    orgId,
    actorId: session.user.id,
    email,
    jobIds,
  })

  setResponseStatus(event, 201)
  return result
})
