import { eq, and, sql } from 'drizzle-orm'
import { job, jobPreviewLink, orgSettings } from '../../../database/schema'
import { jobPreviewTokenSchema } from '../../../utils/schemas/jobPreviewLink'
import { createRateLimiter } from '../../../utils/rateLimit'

/**
 * GET /api/public/job-preview/:token
 *
 * Read-only view of a job's application form behind an unguessable token.
 * Unlike /api/public/jobs/:slug this resolves a job in any status (that is the
 * point — it is for reviewing an unpublished form), so it deliberately returns
 * only what the form needs to render and never accepts a submission.
 */
const rateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  message: 'Too many preview requests, please try again shortly',
})

export default defineEventHandler(async (event) => {
  await rateLimit(event)

  const { token } = await getValidatedRouterParams(event, jobPreviewTokenSchema.parse)

  const link = await db.query.jobPreviewLink.findFirst({
    where: eq(jobPreviewLink.token, token),
    columns: { id: true, jobId: true, organizationId: true, expiresAt: true, revokedAt: true },
  })

  // Same 404 for unknown, revoked and expired tokens — nothing to probe for.
  if (!link || !isPreviewLinkUsable(link)) {
    throw createError({ statusCode: 404, statusMessage: 'This preview link is no longer available' })
  }

  const result = await db.query.job.findFirst({
    where: and(eq(job.id, link.jobId), eq(job.organizationId, link.organizationId)),
    columns: {
      id: true,
      title: true,
      description: true,
      location: true,
      type: true,
      status: true,
      experienceLevel: true,
      remoteStatus: true,
      phoneRequirement: true,
      requireResume: true,
      requireCoverLetter: true,
      hideApplicationQuestions: true,
      applicationQuestionsPdfUrl: true,
      applicationFeeEnabled: true,
      applicationFeeUrl: true,
      applicationFeeAmount: true,
      applicationFeeCurrency: true,
    },
    with: {
      organization: {
        columns: { name: true, logo: true },
      },
      questions: {
        orderBy: (q, { asc }) => [asc(q.displayOrder), asc(q.createdAt)],
        columns: {
          id: true,
          sectionId: true,
          type: true,
          label: true,
          description: true,
          content: true,
          required: true,
          options: true,
          config: true,
          displayOrder: true,
        },
      },
      questionSections: {
        orderBy: (s, { asc }) => [asc(s.displayOrder), asc(s.createdAt)],
        columns: { id: true, title: true, description: true, displayOrder: true },
      },
    },
  })

  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'This preview link is no longer available' })
  }

  // Org-configured privacy notice, so the preview matches the real form.
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, link.organizationId),
    columns: { privacyPolicyUrl: true, privacyPolicyText: true, privacyContactEmail: true },
  })

  // Usage signal for the recruiter. Fire-and-forget: a failed counter update
  // must never keep a reviewer from seeing the form.
  db.update(jobPreviewLink)
    .set({ viewCount: sql`${jobPreviewLink.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(jobPreviewLink.id, link.id))
    .catch((err) => {
      logWarn('job_preview.view_count_failed', {
        error_message: err instanceof Error ? err.message : String(err),
      })
    })

  const { organization: org, questionSections, ...jobData } = result
  return {
    ...jobData,
    sections: questionSections,
    /** Always true here — the page uses it to render its preview banner. */
    isPreview: true as const,
    organizationName: org?.name ?? null,
    organizationLogo: org?.logo ?? null,
    privacyPolicyUrl: settings?.privacyPolicyUrl ?? null,
    privacyPolicyText: settings?.privacyPolicyText ?? null,
    privacyContactEmail: settings?.privacyContactEmail ?? null,
  }
})
