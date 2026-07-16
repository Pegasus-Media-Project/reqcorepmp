import type { H3Event } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import { job, user, member, jobAssignment, reviewerInvite } from '../database/schema'

export interface InviteGuestResult {
  assigned: boolean
  invited: boolean
  invitationId?: string
}

/**
 * Invite an external guest reviewer (or assign an existing member) to one or
 * more jobs.
 *  - Existing org member ⇒ create a `jobAssignment` per job directly.
 *  - Otherwise create a single Better Auth invitation (role `guest`) and one
 *    `reviewerInvite` binding per job. Creating the invite ONCE (not per job)
 *    avoids `cancelPendingInvitationsOnReInvite` cancelling earlier per-job
 *    invites. On accept, `bindReviewerInvitesForUser` turns the bindings into
 *    `jobAssignment` rows (server/utils/defaultOrg.ts).
 *
 * Caller must have already authorized the action (owner/admin).
 */
export async function inviteGuestToJobs(params: {
  event: H3Event
  orgId: string
  actorId: string
  email: string
  jobIds: string[]
}): Promise<InviteGuestResult> {
  const { event, orgId, actorId } = params
  const email = params.email.trim().toLowerCase()

  // Keep only jobs that belong to this org.
  const validJobs = await db
    .select({ id: job.id })
    .from(job)
    .where(and(eq(job.organizationId, orgId), inArray(job.id, params.jobIds)))
  const jobIds = validJobs.map(j => j.id)
  if (jobIds.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'No valid jobs selected' })
  }

  // Existing org member? Assign directly.
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, email),
    columns: { id: true },
  })
  if (existingUser) {
    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.userId, existingUser.id), eq(member.organizationId, orgId)),
      columns: { id: true },
    })
    if (existingMember) {
      for (const jobId of jobIds) {
        await db.insert(jobAssignment)
          .values({ organizationId: orgId, jobId, userId: existingUser.id })
          .onConflictDoNothing()
        await db.insert(reviewerInvite)
          .values({
            organizationId: orgId,
            email,
            invitationId: `direct:${existingUser.id}`,
            jobId,
            invitedById: actorId,
            status: 'accepted',
          })
          .onConflictDoNothing()
      }
      recordActivity({
        organizationId: orgId,
        actorId,
        action: 'updated',
        resourceType: 'job',
        resourceId: jobIds[0]!,
        metadata: { guestAssignedUserId: existingUser.id, jobIds },
      })
      return { assigned: true, invited: false }
    }
  }

  // Create ONE guest invitation, bind all selected jobs to it.
  const createInvitation = (auth.api as unknown as {
    createInvitation: (args: {
      body: { email: string; role: string; organizationId?: string }
      headers: Headers
    }) => Promise<{ id: string }>
  }).createInvitation
  const invitation = await createInvitation({
    body: { email, role: 'guest', organizationId: orgId },
    headers: event.headers,
  })

  for (const jobId of jobIds) {
    await db.insert(reviewerInvite)
      .values({
        organizationId: orgId,
        email,
        invitationId: invitation.id,
        jobId,
        invitedById: actorId,
        status: 'pending',
      })
      .onConflictDoNothing()
  }

  recordActivity({
    organizationId: orgId,
    actorId,
    action: 'member_invited',
    resourceType: 'job',
    resourceId: jobIds[0]!,
    metadata: { guestEmail: email, invitationId: invitation.id, jobIds },
  })

  return { assigned: false, invited: true, invitationId: invitation.id }
}
