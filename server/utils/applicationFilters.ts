import { and, eq, inArray, notInArray, or, ilike, gte, lt, isNull, sql, type SQL } from 'drizzle-orm'
import { application, candidate, interview } from '../database/schema'
import { propertyFiltersArraySchema } from './schemas/property'
import { entityIdsMatchingFilters, type PropertyFilter } from './properties'
import type { applicationQuerySchema } from './schemas/application'
import type { z } from 'zod'

export type ApplicationQuery = z.infer<typeof applicationQuerySchema>

/**
 * Translate the application list's filters into SQL conditions.
 *
 * Shared by the list endpoint and the export, so "export all" covers exactly
 * the rows the list is showing rather than a near-miss of them. Callers add
 * their own org scope condition and join `candidate` — the search filter
 * references it.
 */
export async function buildApplicationFilterConditions(params: {
  orgId: string
  query: Pick<ApplicationQuery, 'jobId' | 'candidateId' | 'status' | 'search' | 'score' | 'interview' | 'propertyFilters'>
}): Promise<{ conditions: SQL[], noMatches: boolean }> {
  const { orgId, query } = params
  const conditions: SQL[] = []

  if (query.jobId) conditions.push(eq(application.jobId, query.jobId))
  if (query.candidateId) conditions.push(eq(application.candidateId, query.candidateId))
  if (query.status) conditions.push(eq(application.status, query.status))

  if (query.search) {
    // Escape LIKE meta-characters to keep this a literal substring search.
    const escaped = query.search.replace(/[%_\\]/g, '\\$&')
    const pattern = `%${escaped}%`
    conditions.push(or(
      ilike(candidate.firstName, pattern),
      ilike(candidate.lastName, pattern),
      ilike(sql`${candidate.firstName} || ' ' || ${candidate.lastName}`, pattern),
      ilike(candidate.email, pattern),
    )!)
  }

  if (query.score) {
    switch (query.score) {
      case 'high':
        conditions.push(gte(application.score, 75))
        break
      case 'medium':
        conditions.push(and(gte(application.score, 40), lt(application.score, 75))!)
        break
      case 'low':
        conditions.push(lt(application.score, 40))
        break
      case 'none':
        conditions.push(isNull(application.score))
        break
    }
  }

  if (query.interview) {
    const interviewApplicationIds = db
      .select({ applicationId: interview.applicationId })
      .from(interview)
      .where(eq(interview.organizationId, orgId))
    conditions.push(
      query.interview === 'has-interview'
        ? inArray(application.id, interviewApplicationIds)
        : notInArray(application.id, interviewApplicationIds),
    )
  }

  const propertyFilters = parsePropertyFilters(query.propertyFilters)
  if (propertyFilters.length > 0) {
    const matching = await entityIdsMatchingFilters({
      organizationId: orgId,
      entityType: 'application',
      filters: propertyFilters,
    })
    // No match at all: the caller should return an empty result rather than
    // run a query with an empty IN list.
    if (!matching || matching.size === 0) return { conditions, noMatches: true }
    conditions.push(inArray(application.id, [...matching]))
  }

  return { conditions, noMatches: false }
}

/** Parse the JSON-encoded property filters carried on the query string. */
export function parsePropertyFilters(raw: string | undefined): PropertyFilter[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
  }
  const result = propertyFiltersArraySchema.safeParse(parsed)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
  }
  return result.data as PropertyFilter[]
}
