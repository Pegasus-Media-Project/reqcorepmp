import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { job, jobPreviewLink } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { createJobPreviewLinkSchema } from '../../../utils/schemas/jobPreviewLink'

/**
 * POST /api/jobs/:id/preview-link
 * Create a shareable, read-only review link for this job's application form.
 * Rotating is the same call: any existing active link is revoked first, so a
 * job never has more than one live link.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, idParamSchema.parse)
  await assertJobInScope(session, jobId)
  const body = await readValidatedBody(event, createJobPreviewLinkSchema.parse)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // 32 bytes = 64 hex chars, same strength as org invite links.
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)

  const created = await db.transaction(async (tx) => {
    await tx.update(jobPreviewLink)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(jobPreviewLink.jobId, jobId),
        eq(jobPreviewLink.organizationId, orgId),
        isNull(jobPreviewLink.revokedAt),
      ))

    const [row] = await tx.insert(jobPreviewLink).values({
      organizationId: orgId,
      jobId,
      createdById: session.user.id,
      token,
      expiresAt,
    }).returning({
      id: jobPreviewLink.id,
      token: jobPreviewLink.token,
      expiresAt: jobPreviewLink.expiresAt,
      viewCount: jobPreviewLink.viewCount,
      lastViewedAt: jobPreviewLink.lastViewedAt,
      createdAt: jobPreviewLink.createdAt,
    })
    return row
  })

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create preview link' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'job_preview_link',
    resourceId: created.id,
    metadata: { jobId, expiresAt: created.expiresAt.toISOString() },
  })

  setResponseStatus(event, 201)
  return created
})
