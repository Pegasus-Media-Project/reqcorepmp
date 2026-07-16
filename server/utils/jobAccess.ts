import type { SQL } from 'drizzle-orm'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { application, job, jobAssignment, programAssignment, member } from '../database/schema'

/**
 * ─────────────────────────────────────────────────────────────────────
 * Job scope — the per-resource layer on top of org-wide RBAC.
 * ─────────────────────────────────────────────────────────────────────
 *
 * `requirePermission` answers "can this role touch jobs at all?".  This
 * helper answers "WHICH jobs?" for scoped members.
 *
 *   • owner / admin → manage EVERY job in the org (additive elevation —
 *     assignments never take anything away from them).
 *   • member        → manage only jobs in their assigned programs plus any
 *     individually-assigned jobs.  A member with no assignment manages none.
 *
 * Use `getManagedJobScope` once per request and reuse the result:
 *   - `jobScopeCondition` to filter a list query, or
 *   - `assertJobInScope` to gate a single-resource route.
 */

/** Minimal shape of the session returned by `requirePermission`. */
export interface ScopedSession {
  user: { id: string }
  session: { activeOrganizationId: string }
}

export interface JobScope {
  /** True for owner/admin — no per-job filtering applies. */
  manageAll: boolean
  /** For scoped members, the concrete set of job ids they may manage. */
  jobIds: string[]
}

async function getMemberRole(userId: string, organizationId: string): Promise<string | null> {
  const row = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    columns: { role: true },
  })
  return row?.role ?? null
}

/**
 * Resolve which jobs the current user may manage in their active org.
 * owner/admin short-circuit to `manageAll`. Members get the union of jobs in
 * their assigned programs and their individually-assigned jobs.
 */
export async function getManagedJobScope(session: ScopedSession): Promise<JobScope> {
  const organizationId = session.session.activeOrganizationId
  const userId = session.user.id

  const role = await getMemberRole(userId, organizationId)
  if (role === 'owner' || role === 'admin') {
    return { manageAll: true, jobIds: [] }
  }

  const [programAssigns, jobAssigns] = await Promise.all([
    db.query.programAssignment.findMany({
      where: and(
        eq(programAssignment.userId, userId),
        eq(programAssignment.organizationId, organizationId),
      ),
      columns: { programId: true },
    }),
    db.query.jobAssignment.findMany({
      where: and(
        eq(jobAssignment.userId, userId),
        eq(jobAssignment.organizationId, organizationId),
      ),
      columns: { jobId: true },
    }),
  ])

  const jobIds = new Set(jobAssigns.map(j => j.jobId))
  const programIds = programAssigns.map(p => p.programId)
  if (programIds.length) {
    const programJobs = await db.query.job.findMany({
      where: and(eq(job.organizationId, organizationId), inArray(job.programId, programIds)),
      columns: { id: true },
    })
    for (const j of programJobs) jobIds.add(j.id)
  }

  return { manageAll: false, jobIds: [...jobIds] }
}

/**
 * Build a Drizzle WHERE fragment restricting a query to the caller's scope.
 *
 * @param scope  result of `getManagedJobScope`
 * @param column the job-id column to constrain (e.g. `job.id`, `application.jobId`)
 * @returns `undefined` for owner/admin (no extra filter), otherwise a condition
 *          that matches only in-scope rows (and matches nothing when empty).
 */
export function jobScopeCondition(scope: JobScope, column: Parameters<typeof inArray>[0]): SQL | undefined {
  if (scope.manageAll) return undefined
  if (scope.jobIds.length === 0) return sql`false`
  return inArray(column, scope.jobIds)
}

/**
 * Gate a single-resource route: throws 404 if the caller can't manage `jobId`.
 * Uses 404 (not 403) so scoped members can't probe which job ids exist.
 */
export async function assertJobInScope(session: ScopedSession, jobId: string): Promise<void> {
  const scope = await getManagedJobScope(session)
  if (scope.manageAll) return
  if (!scope.jobIds.includes(jobId)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

/**
 * Gate an application-scoped route: resolves the application's job (within the
 * active org) and checks it against the caller's scope. Throws 404 if the
 * application doesn't exist in the org or the caller can't manage its job.
 */
export async function assertApplicationInScope(session: ScopedSession, applicationId: string): Promise<void> {
  const scope = await getManagedJobScope(session)
  if (scope.manageAll) return

  const row = await db.query.application.findFirst({
    where: and(
      eq(application.id, applicationId),
      eq(application.organizationId, session.session.activeOrganizationId),
    ),
    columns: { jobId: true },
  })
  if (!row || !scope.jobIds.includes(row.jobId)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}
