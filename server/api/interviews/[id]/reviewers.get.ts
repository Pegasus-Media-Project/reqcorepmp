import { and, eq } from 'drizzle-orm'
import { interview, interviewReviewer, user } from '../../../database/schema'
import { interviewIdParamSchema } from '../../../utils/schemas/interview'

/**
 * GET /api/interviews/:id/reviewers
 * List reviewers assigned to an interview. Requires interview:read and that the
 * interview's job is in the caller's scope.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)

  const iv = await db.query.interview.findFirst({
    where: and(eq(interview.id, id), eq(interview.organizationId, orgId)),
    columns: { applicationId: true },
  })
  if (!iv) throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  await assertApplicationInScope(session, iv.applicationId)

  const rows = await db
    .select({
      userId: interviewReviewer.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      invitedAt: interviewReviewer.invitedAt,
      calendarSynced: interviewReviewer.calendarSynced,
    })
    .from(interviewReviewer)
    .innerJoin(user, eq(user.id, interviewReviewer.userId))
    .where(and(eq(interviewReviewer.organizationId, orgId), eq(interviewReviewer.interviewId, id)))

  return { data: rows }
})
