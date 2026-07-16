import { and, count, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { interview, interviewReviewer, application, candidate, job, review } from '../../database/schema'
import { interviewQuerySchema } from '../../utils/schemas/interview'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const userEmail = (session.user.email ?? '').toLowerCase()

  const query = await getValidatedQuery(event, interviewQuerySchema.parse)

  const conditions = [eq(interview.organizationId, orgId)]

  if (query.applicationId) {
    conditions.push(eq(interview.applicationId, query.applicationId))
  }
  if (query.jobId) {
    conditions.push(eq(application.jobId, query.jobId))
  }
  if (query.status) {
    conditions.push(eq(interview.status, query.status))
  }
  if (query.from) {
    conditions.push(gte(interview.scheduledAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(interview.scheduledAt, new Date(query.to)))
  }

  // "My interviews": assigned reviewer OR interviewer email OR creator.
  if (query.scope === 'mine') {
    const myReviewerInterviews = db
      .select({ interviewId: interviewReviewer.interviewId })
      .from(interviewReviewer)
      .where(and(eq(interviewReviewer.organizationId, orgId), eq(interviewReviewer.userId, userId)))
    const mineCondition = or(
      inArray(interview.id, myReviewerInterviews),
      eq(interview.createdById, userId),
      ...(userEmail ? [sql`${interview.interviewers}::jsonb ? ${userEmail}`] : []),
    )
    if (mineCondition) conditions.push(mineCondition)
  }

  const whereClause = and(...conditions)

  const [data, total] = await Promise.all([
    db
      .select({
        id: interview.id,
        title: interview.title,
        type: interview.type,
        status: interview.status,
        scheduledAt: interview.scheduledAt,
        duration: interview.duration,
        location: interview.location,
        notes: interview.notes,
        interviewers: interview.interviewers,
        invitationSentAt: interview.invitationSentAt,
        candidateResponse: interview.candidateResponse,
        candidateRespondedAt: interview.candidateRespondedAt,
        googleCalendarEventId: interview.googleCalendarEventId,
        googleCalendarEventLink: interview.googleCalendarEventLink,
        createdAt: interview.createdAt,
        updatedAt: interview.updatedAt,
        applicationId: interview.applicationId,
        candidateFirstName: candidate.firstName,
        candidateLastName: candidate.lastName,
        candidateEmail: candidate.email,
        jobId: application.jobId,
        jobTitle: job.title,
      })
      .from(interview)
      .innerJoin(application, eq(application.id, interview.applicationId))
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(whereClause)
      .orderBy(desc(interview.scheduledAt))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db
      .select({ count: count() })
      .from(interview)
      .innerJoin(application, eq(application.id, interview.applicationId))
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(whereClause)
      .then(rows => rows[0]?.count ?? 0),
  ])

  // Attach the applicant's interview-stage rating summary to each row.
  const appIds = [...new Set(data.map(d => d.applicationId))]
  const reviewRows = appIds.length > 0
    ? await db
        .select({ applicationId: review.applicationId, rating: review.rating, reviewerId: review.reviewerId })
        .from(review)
        .where(and(
          eq(review.organizationId, orgId),
          eq(review.stage, 'interview'),
          inArray(review.applicationId, appIds),
        ))
    : []
  const byApp = new Map<string, { sum: number, n: number, mine: number | null }>()
  for (const r of reviewRows) {
    const e = byApp.get(r.applicationId) ?? { sum: 0, n: 0, mine: null }
    if (r.rating != null) { e.sum += r.rating; e.n += 1 }
    if (r.reviewerId === userId && r.rating != null) e.mine = r.rating
    byApp.set(r.applicationId, e)
  }

  const enriched = data.map((d) => {
    const e = byApp.get(d.applicationId)
    return {
      ...d,
      interviewAvg: e && e.n > 0 ? Math.round((e.sum / e.n) * 10) / 10 : null,
      myRating: e?.mine ?? null,
    }
  })

  return { data: enriched, total, page: query.page, limit: query.limit }
})
