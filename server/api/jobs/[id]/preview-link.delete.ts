import { and, eq, isNull } from 'drizzle-orm'
import { job, jobPreviewLink } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * DELETE /api/jobs/:id/preview-link
 * Revoke the job's active application-form review link. Idempotent — revoking
 * when there is no live link succeeds and reports zero revocations.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, idParamSchema.parse)
  await assertJobInScope(session, jobId)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const revoked = await db.update(jobPreviewLink)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(jobPreviewLink.jobId, jobId),
      eq(jobPreviewLink.organizationId, orgId),
      isNull(jobPreviewLink.revokedAt),
    ))
    .returning({ id: jobPreviewLink.id })

  for (const link of revoked) {
    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'deleted',
      resourceType: 'job_preview_link',
      resourceId: link.id,
      metadata: { jobId },
    })
  }

  return { revoked: revoked.length }
})
