/**
 * POST /api/admin/retention-cleanup
 *
 * Automated GDPR retention sweep. For every org with retention enabled:
 *   1. Quarantine candidates whose retention window has elapsed (recoverable).
 *   2. Permanently erase candidates whose quarantine window has elapsed.
 *
 * Auth: server-to-server via `x-cron-secret` (see CRON_SECRET), OR an
 * authenticated owner/admin (candidate:delete) for a manual trigger.
 *
 * Body (optional): { dryRun?: boolean, batchSize?: number }
 *   dryRun   — report what would happen, mutate nothing.
 *   batchSize — cap on candidates erased per run (default 200) to bound runtime.
 *
 * Idempotent: safe to run repeatedly; partial failures retry on the next run.
 *
 * Self-hosted: point any external scheduler at this endpoint daily with the
 * `x-cron-secret` header. Hosted deployments use Railway cron. See SELF-HOSTING.md.
 */
import { z } from 'zod'
import { and, eq, isNull, isNotNull, lte, max } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'
import { candidate, application, orgSettings } from '../../database/schema'
import { eraseCandidates, recordRetentionAudit } from '../../utils/erasure'
import { computeRetentionState, isPurgeEligible } from '../../utils/retention'

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(2000).optional().default(200),
})

export default defineEventHandler(async (event) => {
  // ── Auth: cron secret (server-to-server) or interactive admin ──
  const cronSecret = getHeader(event, 'x-cron-secret')
  let actorId: string | null = null
  if (cronSecret && env.CRON_SECRET) {
    const a = Buffer.alloc(64)
    const b = Buffer.alloc(64)
    Buffer.from(cronSecret).copy(a)
    Buffer.from(env.CRON_SECRET).copy(b)
    const valid = cronSecret.length === env.CRON_SECRET.length && timingSafeEqual(a, b)
    if (!valid) {
      throw createError({ statusCode: 403, statusMessage: 'Invalid cron secret' })
    }
  }
  else {
    const session = await requirePermission(event, { candidate: ['delete'] })
    actorId = session.user.id
  }

  const { dryRun, batchSize } = await readValidatedBody(event, bodySchema.parse)
  const now = new Date()

  // Only orgs that have opted in to retention.
  const orgs = await db.query.orgSettings.findMany({
    where: eq(orgSettings.retentionEnabled, true),
    columns: {
      organizationId: true,
      retentionMonths: true,
      quarantineDays: true,
      retentionActivatedAt: true,
    },
  })

  let quarantined = 0
  let erased = 0
  let skipped = 0
  let remainingErasures = batchSize
  const perOrg: Array<Record<string, unknown>> = []

  for (const org of orgs) {
    const orgId = org.organizationId

    // Latest recruitment-process activity per candidate (MAX application.updatedAt).
    const latestRows = await db
      .select({ candidateId: application.candidateId, latest: max(application.updatedAt) })
      .from(application)
      .where(eq(application.organizationId, orgId))
      .groupBy(application.candidateId)
    const latestByCandidate = new Map(latestRows.map(r => [r.candidateId, r.latest]))

    // ── Phase 1: quarantine newly-expired candidates (not exempt, not already quarantined) ──
    const activeCandidates = await db.query.candidate.findMany({
      where: and(eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt)),
      columns: { id: true, createdAt: true, retentionExemptUntil: true, retentionReviewedAt: true },
    })

    let orgQuarantined = 0
    for (const c of activeCandidates) {
      const { status } = computeRetentionState({
        latestProcessEnd: latestByCandidate.get(c.id) ?? null,
        candidateCreatedAt: c.createdAt,
        lastReviewedAt: c.retentionReviewedAt,
        retentionActivatedAt: org.retentionActivatedAt,
        retentionMonths: org.retentionMonths,
        exemptUntil: c.retentionExemptUntil,
        now,
      })
      if (status !== 'expired') continue

      orgQuarantined++
      quarantined++
      if (dryRun) continue

      const purgeAt = new Date(now.getTime() + org.quarantineDays * 24 * 60 * 60 * 1000)
      await db.update(candidate)
        .set({ quarantinedAt: now, scheduledPurgeAt: purgeAt })
        .where(and(eq(candidate.id, c.id), eq(candidate.organizationId, orgId)))
      await recordRetentionAudit(orgId, c.id, 'quarantined', 'success', actorId, {})
    }

    // ── Phase 2: erase candidates past their purge date (respecting batch + exemptions) ──
    const quarantinedCandidates = await db.query.candidate.findMany({
      where: and(
        eq(candidate.organizationId, orgId),
        isNotNull(candidate.quarantinedAt),
        lte(candidate.scheduledPurgeAt, now),
      ),
      columns: { id: true, scheduledPurgeAt: true, retentionExemptUntil: true },
    })

    const toErase = quarantinedCandidates
      .filter(c => isPurgeEligible({ scheduledPurgeAt: c.scheduledPurgeAt, exemptUntil: c.retentionExemptUntil, now }))
      .slice(0, remainingErasures)
      .map(c => c.id)

    let orgErased = 0
    if (toErase.length > 0) {
      const report = await eraseCandidates(orgId, toErase, { dryRun, actorId })
      orgErased = report.erased
      erased += report.erased
      skipped += report.skipped
      remainingErasures -= toErase.length
    }

    perOrg.push({ organizationId: orgId, quarantined: orgQuarantined, erased: orgErased })

    if (remainingErasures <= 0) break
  }

  logInfo('retention.cleanup_run', { dry_run: dryRun, orgs: orgs.length, quarantined, erased, skipped })

  return {
    dryRun,
    orgsProcessed: orgs.length,
    quarantined,
    erased,
    skipped,
    batchExhausted: remainingErasures <= 0,
    perOrg,
  }
})
