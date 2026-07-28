import { asc, eq, and, desc, inArray, notInArray, or, ilike, gte, lt, isNull, isNotNull, count, sql } from 'drizzle-orm'
import { application, applicationStatusEnum, candidate, interview, job, review } from '../../database/schema'
import { applicationQuerySchema } from '../../utils/schemas/application'
import { buildApplicationFilterConditions } from '../../utils/applicationFilters'
import { loadPropertyEntriesForEntities } from '../../utils/properties'

type StatusCountRow = { status: (typeof applicationStatusEnum.enumValues)[number], count: number }

function tallyStatusCounts(rows: StatusCountRow[]) {
  const counts = { new: 0, screening: 0, interview: 0, waitlist: 0, offer: 0, hired: 0, rejected: 0 }
  for (const row of rows) {
    counts[row.status] = Number(row.count)
  }
  return counts
}

/**
 * GET /api/applications
 * List applications for the current organization.
 * Filterable by jobId, candidateId, status, and custom property filters. Paginated.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const query = await getValidatedQuery(event, applicationQuerySchema.parse)

  // Restrict scoped members to applications for jobs they manage.
  const scope = await getManagedJobScope(session)
  const scopeCondition = jobScopeCondition(scope, application.jobId)

  const offset = (query.page - 1) * query.limit
  const conditions = [eq(application.organizationId, orgId)]
  if (scopeCondition) conditions.push(scopeCondition)

  // Filters are built by the shared helper so the export covers exactly the
  // rows listed here.
  const { conditions: filterConditions, noMatches } = await buildApplicationFilterConditions({ orgId, query })
  conditions.push(...filterConditions)

  // Job-wide per-status totals for the pipeline tab badges. Intentionally ignores
  // every active filter so the badges stay put as the user narrows the list.
  const jobIdInScope = !!query.jobId && (scope.manageAll || scope.jobIds.includes(query.jobId))
  const statusCountsPromise: Promise<StatusCountRow[]> = jobIdInScope
    ? db
        .select({ status: application.status, count: count() })
        .from(application)
        .where(and(eq(application.organizationId, orgId), eq(application.jobId, query.jobId!)))
        .groupBy(application.status)
    : Promise.resolve([])

  // A property filter that matched nothing: nothing to list, but the badges
  // still report the job's real totals.
  if (noMatches) {
    return {
      data: [],
      total: 0,
      page: query.page,
      limit: query.limit,
      statusCounts: tallyStatusCounts(await statusCountsPromise),
    }
  }

  const where = and(...conditions)

  const orderBy = (() => {
    switch (query.sort) {
      case 'date-asc': return [asc(application.createdAt)] as const
      case 'name-asc': return [asc(candidate.firstName), asc(candidate.lastName)] as const
      case 'name-desc': return [desc(candidate.firstName), desc(candidate.lastName)] as const
      case 'score-desc': return [sql`${application.score} DESC NULLS LAST`, desc(application.createdAt)] as const
      case 'score-asc': return [sql`COALESCE(${application.score}, -1) ASC`, desc(application.createdAt)] as const
      case 'updated-desc': return [desc(application.updatedAt)] as const
      default: return [desc(application.createdAt)] as const
    }
  })()

  const [data, totalRows, statusCountRows] = await Promise.all([
    db
      .select({
        id: application.id,
        status: application.status,
        score: application.score,
        notes: application.notes,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        candidateId: application.candidateId,
        candidateFirstName: candidate.firstName,
        candidateLastName: candidate.lastName,
        candidateEmail: candidate.email,
        jobId: application.jobId,
        jobTitle: job.title,
        jobStatus: job.status,
        feeStatus: application.feeStatus,
        applicationFeeEnabled: job.applicationFeeEnabled,
      })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(where),
    statusCountsPromise,
  ])

  const statusCounts = tallyStatusCounts(statusCountRows)

  // Bulk-attach properties for the current page (org-global + per-job)
  const ids = data.map((a) => a.id)
  const jobIds = [...new Set(data.map((a) => a.jobId))]
  const entityJobIds = new Map(data.map((a) => [a.id, a.jobId] as const))
  const propertyMap = await loadPropertyEntriesForEntities({
    organizationId: orgId,
    entityType: 'application',
    entityIds: ids,
    jobIds,
    entityJobIds,
  })
  const interviewedApplicationIds = ids.length > 0
    ? await db
        .selectDistinct({ applicationId: interview.applicationId })
        .from(interview)
        .where(and(eq(interview.organizationId, orgId), inArray(interview.applicationId, ids)))
    : []
  const interviewedIds = new Set(interviewedApplicationIds.map(row => row.applicationId))

  // Per-stage average reviewer rating for the current page (replaces AI score).
  const reviewAggRows = ids.length > 0
    ? await db
        .select({
          applicationId: review.applicationId,
          stage: review.stage,
          avg: sql<number | null>`avg(${review.rating})`,
        })
        .from(review)
        .where(and(
          eq(review.organizationId, orgId),
          inArray(review.applicationId, ids),
          isNotNull(review.rating),
        ))
        .groupBy(review.applicationId, review.stage)
    : []
  const reviewAgg = new Map<string, { screeningAvg: number | null, interviewAvg: number | null }>()
  for (const r of reviewAggRows) {
    const entry = reviewAgg.get(r.applicationId) ?? { screeningAvg: null, interviewAvg: null }
    const val = r.avg == null ? null : Math.round(Number(r.avg) * 10) / 10
    if (r.stage === 'screening') entry.screeningAvg = val
    else entry.interviewAvg = val
    reviewAgg.set(r.applicationId, entry)
  }

  const enriched = data.map((a) => ({
    ...a,
    properties: propertyMap.get(a.id) ?? [],
    hasInterview: interviewedIds.has(a.id),
    screeningAvg: reviewAgg.get(a.id)?.screeningAvg ?? null,
    interviewAvg: reviewAgg.get(a.id)?.interviewAvg ?? null,
  }))

  return {
    data: enriched,
    total: Number(totalRows[0]?.count ?? 0),
    page: query.page,
    limit: query.limit,
    statusCounts,
  }
})
