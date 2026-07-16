import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { job, user, member, jobAssignment, reviewerInvite } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

const bodySchema = z.object({ email: z.string().email() })

/**
 * POST /api/jobs/:id/guests
 *
 * Invite an external guest reviewer to this specific job. Owner/admin only.
 *  - If a user with that email is already an org member, assign them to the job
 *    directly (no invite needed).
 *  - Otherwise create a Better Auth invitation with role `guest` and record a
 *    `reviewerInvite` binding; on accept the guest is confined to this job (see
 *    bindReviewerInvitesForUser in server/utils/defaultOrg.ts).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { program: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const { email } = await readValidatedBody(event, bodySchema.parse)
  const normalized = email.trim().toLowerCase()

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // Already an org member? Assign directly.
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, normalized),
    columns: { id: true },
  })
  if (existingUser) {
    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.userId, existingUser.id), eq(member.organizationId, orgId)),
      columns: { id: true },
    })
    if (existingMember) {
      await db.insert(jobAssignment)
        .values({ organizationId: orgId, jobId: id, userId: existingUser.id })
        .onConflictDoNothing()
      await db.insert(reviewerInvite)
        .values({
          organizationId: orgId,
          email: normalized,
          invitationId: `direct:${existingUser.id}`,
          jobId: id,
          invitedById: session.user.id,
          status: 'accepted',
        })
        .onConflictDoNothing()
      recordActivity({
        organizationId: orgId,
        actorId: session.user.id,
        action: 'updated',
        resourceType: 'job',
        resourceId: id,
        metadata: { guestAssignedUserId: existingUser.id },
      })
      setResponseStatus(event, 201)
      return { assigned: true }
    }
  }

  // Otherwise create a guest invitation and bind it to this job.
  // The organization plugin's endpoints aren't surfaced on the typed `auth.api`
  // proxy, so cast to the known callable (same pattern as auth.api.signOut).
  const createInvitation = (auth.api as unknown as {
    createInvitation: (args: {
      body: { email: string; role: string; organizationId?: string }
      headers: Headers
    }) => Promise<{ id: string }>
  }).createInvitation
  const invitation = await createInvitation({
    body: { email: normalized, role: 'guest', organizationId: orgId },
    headers: event.headers,
  })

  await db.insert(reviewerInvite)
    .values({
      organizationId: orgId,
      email: normalized,
      invitationId: invitation.id,
      jobId: id,
      invitedById: session.user.id,
      status: 'pending',
    })
    .onConflictDoNothing()

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'member_invited',
    resourceType: 'job',
    resourceId: id,
    metadata: { guestEmail: normalized, invitationId: invitation.id },
  })

  setResponseStatus(event, 201)
  return { invited: true, invitationId: invitation.id }
})
