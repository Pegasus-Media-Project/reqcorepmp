import { and, eq } from 'drizzle-orm'
import { interview, interviewReviewer, user } from '../../../../database/schema'
import { interviewReviewerParamSchema } from '../../../../utils/schemas/interview'

/**
 * DELETE /api/interviews/:id/reviewers/:userId
 * Unassign a reviewer from an interview. Also removes their email from the
 * interview's interviewer list. Requires interview:update and job scope.
 * (The Google Calendar attendee, if any, is left in place — cancelling a single
 * attendee's invite isn't exposed here.)
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id, userId } = await getValidatedRouterParams(event, interviewReviewerParamSchema.parse)

  const iv = await db.query.interview.findFirst({
    where: and(eq(interview.id, id), eq(interview.organizationId, orgId)),
    columns: { applicationId: true, interviewers: true },
  })
  if (!iv) throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  await assertApplicationInScope(session, iv.applicationId)

  await db.delete(interviewReviewer).where(and(
    eq(interviewReviewer.organizationId, orgId),
    eq(interviewReviewer.interviewId, id),
    eq(interviewReviewer.userId, userId),
  ))

  // Drop the reviewer's email from the interviewers array too.
  const removed = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  })
  if (removed) {
    const current = (iv.interviewers as string[] | null) ?? []
    const next = current.filter(e => e.toLowerCase() !== removed.email.toLowerCase())
    if (next.length !== current.length) {
      await db.update(interview)
        .set({ interviewers: next, updatedAt: new Date() })
        .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
    }
  }

  return { success: true }
})
