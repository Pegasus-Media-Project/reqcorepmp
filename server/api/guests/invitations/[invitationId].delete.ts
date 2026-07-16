import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { reviewerInvite } from '../../../database/schema'

const paramsSchema = z.object({ invitationId: z.string().min(1) })

/**
 * DELETE /api/guests/invitations/:invitationId
 * Cancel a pending guest invitation (owner/admin only): cancel the Better Auth
 * invitation and delete its `reviewerInvite` job bindings.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { invitationId } = await getValidatedRouterParams(event, paramsSchema.parse)

  // Cancel the Better Auth invitation (org plugin endpoint not on the typed
  // proxy — cast, same pattern as auth.api.signOut / createInvitation).
  try {
    const cancelInvitation = (auth.api as unknown as {
      cancelInvitation: (args: { body: { invitationId: string }; headers: Headers }) => Promise<unknown>
    }).cancelInvitation
    await cancelInvitation({ body: { invitationId }, headers: event.headers })
  }
  catch {
    // Invitation may already be gone/expired — proceed to clean up bindings.
  }

  await db.delete(reviewerInvite).where(and(
    eq(reviewerInvite.organizationId, orgId),
    eq(reviewerInvite.invitationId, invitationId),
  ))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { cancelledGuestInvitationId: invitationId },
  })

  setResponseStatus(event, 204)
  return null
})
