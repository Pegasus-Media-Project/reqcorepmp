import { z } from 'zod'
import { idParamSchema } from '../../../utils/schemas/job'
import { inviteGuestToJobs } from '../../../utils/guestInvites'

const bodySchema = z.object({ email: z.string().email() })

/**
 * POST /api/jobs/:id/guests
 * Invite an external guest reviewer to this single job (owner/admin only).
 * Delegates to the shared inviteGuestToJobs helper.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const result = await inviteGuestToJobs({
    event,
    orgId,
    actorId: session.user.id,
    email,
    jobIds: [id],
  })

  setResponseStatus(event, 201)
  return result
})
