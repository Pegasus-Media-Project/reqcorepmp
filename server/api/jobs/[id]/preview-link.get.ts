import { and, eq, gt, isNull, desc } from 'drizzle-orm'
import { job, jobPreviewLink } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'

/**
 * GET /api/jobs/:id/preview-link
 * Returns the job's active application-form review link, or null when there
 * isn't one. Never returns revoked or expired links.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, idParamSchema.parse)
  await assertJobInScope(session, jobId)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const active = await db.query.jobPreviewLink.findFirst({
    where: and(
      eq(jobPreviewLink.jobId, jobId),
      eq(jobPreviewLink.organizationId, orgId),
      isNull(jobPreviewLink.revokedAt),
      gt(jobPreviewLink.expiresAt, new Date()),
    ),
    orderBy: [desc(jobPreviewLink.createdAt)],
    columns: {
      id: true,
      token: true,
      expiresAt: true,
      viewCount: true,
      lastViewedAt: true,
      createdAt: true,
    },
  })

  return active ?? null
})
