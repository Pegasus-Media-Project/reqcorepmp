/**
 * ─────────────────────────────────────────────
 * Candidate erasure service — the single source of truth for deletion
 * ─────────────────────────────────────────────
 *
 * Both manual deletion ([server/api/candidates/[id].delete.ts]) and the
 * automated retention cron ([server/api/admin/retention-cleanup.post.ts])
 * route through `eraseCandidates` so they produce identical results.
 *
 * Why this exists: a plain `DELETE FROM candidate` relies on FK cascades and
 * therefore LEAKS data — it orphans S3 objects and leaves behind the
 * polymorphic `property_value`, `comment`, and `activity_log` rows (which link
 * to candidates by id, with no FK). This service erases all of it.
 *
 * Ordering & safety:
 *   1. Delete S3 objects FIRST. If any fail, we DO NOT delete the DB rows —
 *      the `document.storageKey` is the only handle for a retry, so losing it
 *      would orphan the object forever. The candidate is left in place and the
 *      next cron run retries (idempotent).
 *   2. Then, in one transaction, delete the polymorphic rows and the candidate.
 *      The candidate delete cascades application → responses / interviews /
 *      criterion_score / analysis_run / application_source, and document rows.
 *
 * `db`, `deleteFromS3`, `logWarn`, `logInfo`, `logError` are Nitro auto-imports (globals).
 */
import { and, eq } from 'drizzle-orm'
import {
  candidate,
  document,
  propertyValue,
  comment,
  activityLog,
  retentionAudit,
} from '../database/schema'

export interface ErasureOptions {
  /** When true, compute and report what would be deleted but mutate nothing. */
  dryRun?: boolean
  /** Triggering user id, or null/undefined for scheduled cron runs. */
  actorId?: string | null
}

export type ErasureStatus = 'erased' | 'skipped_s3_failure' | 'not_found' | 'would_erase'

export interface ErasureResult {
  candidateId: string
  status: ErasureStatus
  documents: number
  comments: number
  properties: number
  activityLogs: number
  s3Failures: number
  /** True when the candidate was erased but its audit row could not be written. */
  auditFailed?: boolean
  error?: string
}

export interface ErasureReport {
  dryRun: boolean
  processed: number
  erased: number
  skipped: number
  results: ErasureResult[]
}

/**
 * Permanently erase one or more candidates and their entire data graph + S3 objects.
 * Org-scoped: only candidates belonging to `orgId` are touched. Idempotent and
 * safe to retry — already-gone candidates report `not_found` and missing S3
 * objects delete silently.
 */
export async function eraseCandidates(
  orgId: string,
  candidateIds: string[],
  opts: ErasureOptions = {},
): Promise<ErasureReport> {
  const dryRun = opts.dryRun ?? false
  const actorId = opts.actorId ?? null
  const results: ErasureResult[] = []

  for (const candidateId of candidateIds) {
    results.push(await eraseOne(orgId, candidateId, dryRun, actorId))
  }

  return {
    dryRun,
    processed: results.length,
    erased: results.filter(r => r.status === 'erased' || r.status === 'would_erase').length,
    skipped: results.filter(r => r.status === 'skipped_s3_failure' || r.status === 'not_found').length,
    results,
  }
}

async function eraseOne(
  orgId: string,
  candidateId: string,
  dryRun: boolean,
  actorId: string | null,
): Promise<ErasureResult> {
  // Confirm the candidate exists in THIS org (tenant isolation + idempotency).
  const existing = await db.query.candidate.findFirst({
    where: and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)),
    columns: { id: true },
  })

  if (!existing) {
    return blank(candidateId, 'not_found')
  }

  // Gather everything tied to the candidate (org-scoped on every query).
  const docs = await db.query.document.findMany({
    where: and(eq(document.candidateId, candidateId), eq(document.organizationId, orgId)),
    columns: { storageKey: true },
  })
  const [commentRows, propertyRows, activityRows] = await Promise.all([
    db.select({ id: comment.id }).from(comment).where(
      and(eq(comment.targetType, 'candidate'), eq(comment.targetId, candidateId), eq(comment.organizationId, orgId)),
    ),
    db.select({ id: propertyValue.id }).from(propertyValue).where(
      and(eq(propertyValue.entityType, 'candidate'), eq(propertyValue.entityId, candidateId), eq(propertyValue.organizationId, orgId)),
    ),
    db.select({ id: activityLog.id }).from(activityLog).where(
      and(eq(activityLog.resourceType, 'candidate'), eq(activityLog.resourceId, candidateId), eq(activityLog.organizationId, orgId)),
    ),
  ])

  const counts = {
    documents: docs.length,
    comments: commentRows.length,
    properties: propertyRows.length,
    activityLogs: activityRows.length,
  }

  if (dryRun) {
    return { candidateId, status: 'would_erase', s3Failures: 0, ...counts }
  }

  // ── Step 1: delete S3 objects first ──
  let s3Failures = 0
  for (const doc of docs) {
    try {
      await deleteFromS3(doc.storageKey)
    }
    catch (err) {
      s3Failures++
      logWarn('retention.s3_delete_failed', {
        org_id: orgId,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Abort DB deletion if any object failed — keep the storageKeys for a retry.
  if (s3Failures > 0) {
    await writeAudit(orgId, candidateId, 'erased', 'partial', actorId, { ...counts, s3Failures })
    return { candidateId, status: 'skipped_s3_failure', s3Failures, ...counts }
  }

  // ── Step 2: delete the DB graph in one transaction ──
  await db.transaction(async (tx) => {
    await tx.delete(comment).where(
      and(eq(comment.targetType, 'candidate'), eq(comment.targetId, candidateId), eq(comment.organizationId, orgId)),
    )
    await tx.delete(propertyValue).where(
      and(eq(propertyValue.entityType, 'candidate'), eq(propertyValue.entityId, candidateId), eq(propertyValue.organizationId, orgId)),
    )
    await tx.delete(activityLog).where(
      and(eq(activityLog.resourceType, 'candidate'), eq(activityLog.resourceId, candidateId), eq(activityLog.organizationId, orgId)),
    )
    // Cascades application → responses / interviews / scores / analysis / source, and documents.
    await tx.delete(candidate).where(
      and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)),
    )
  })

  const audited = await writeAudit(orgId, candidateId, 'erased', 'success', actorId, counts)
  logInfo('retention.candidate_erased', { org_id: orgId, ...counts })

  return { candidateId, status: 'erased', s3Failures: 0, ...counts, auditFailed: !audited }
}

async function writeAudit(
  orgId: string,
  candidateId: string,
  action: 'erased' | 'quarantined' | 'restored' | 'exempted' | 'unexempted' | 'exported',
  result: string,
  actorId: string | null,
  metadata: Record<string, number>,
): Promise<boolean> {
  try {
    await db.insert(retentionAudit).values({
      organizationId: orgId,
      candidateId,
      action,
      result,
      actorId,
      metadata,
    })
    return true
  }
  catch (err) {
    // A missing audit trail for an irreversible erasure is a compliance problem,
    // not a warning — escalate to error so it is alerted on, and report back to
    // the caller (the result carries `auditFailed`) rather than swallowing it.
    logError('retention.audit_write_failed', {
      org_id: orgId,
      candidate_id: candidateId,
      action,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** Re-exported so endpoints can record quarantine/restore/exempt without duplicating the helper. */
export { writeAudit as recordRetentionAudit }

function blank(candidateId: string, status: ErasureStatus): ErasureResult {
  return { candidateId, status, documents: 0, comments: 0, properties: 0, activityLogs: 0, s3Failures: 0 }
}
