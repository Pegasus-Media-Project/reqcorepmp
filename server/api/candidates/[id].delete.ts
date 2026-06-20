import { eq, and } from 'drizzle-orm'
import { candidate } from '../../database/schema'
import { candidateIdParamSchema } from '../../utils/schemas/candidate'
import { eraseCandidates } from '../../utils/erasure'

/**
 * DELETE /api/candidates/:id
 *
 * Full GDPR erasure of a candidate — DB graph + S3 objects + polymorphic rows.
 * Shares the exact erasure path used by automated retention, so manual and
 * scheduled deletion produce identical results.
 *
 * Legal holds: a candidate with an active retention exemption (legal hold) is
 * protected from deletion. To delete anyway, the caller must pass `?override=true`
 * — an explicit, audited acknowledgement that the hold is being lifted.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, candidateIdParamSchema.parse)
  const override = getQuery(event).override === 'true'

  // Block deletion of candidates on an active legal hold unless explicitly overridden.
  const existing = await db.query.candidate.findFirst({
    where: and(eq(candidate.id, id), eq(candidate.organizationId, orgId)),
    columns: { retentionExemptUntil: true },
  })
  if (existing?.retentionExemptUntil && existing.retentionExemptUntil > new Date() && !override) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Candidate is under a legal hold; pass override=true to delete anyway',
    })
  }

  const report = await eraseCandidates(orgId, [id], {
    actorId: session.user.id,
    auditMetadata: override ? { legalHoldOverride: 'true' } : undefined,
  })
  const result = report.results[0]

  if (!result || result.status === 'not_found') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (result.status === 'skipped_s3_failure') {
    // Storage objects couldn't be removed — refuse to leave a partially-erased
    // record. The candidate is untouched and can be retried.
    throw createError({ statusCode: 502, statusMessage: 'Storage deletion failed; candidate not erased' })
  }
  if (result.auditFailed) {
    logError('retention.manual_erasure_audit_failed', {
      org_id: orgId,
      candidate_id: id,
      actor_id: session.user.id,
    })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'candidate',
    resourceId: id,
  })

  setResponseStatus(event, 204)
  return null
})
