import { eq, and } from 'drizzle-orm'
import { application, job, candidate } from '../../database/schema'
import { applicationIdParamSchema, updateApplicationSchema, APPLICATION_STATUS_TRANSITIONS } from '../../utils/schemas/application'

/**
 * PATCH /api/applications/:id
 * Update application status (with server-side transition validation), notes, and score.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationInScope(session, id)
  const body = await readValidatedBody(event, updateApplicationSchema.parse)

  // Fetch current application + job/candidate context for transition validation,
  // onboarding-step gates, and lifecycle emails.
  const [current] = await db
    .select({
      id: application.id,
      status: application.status,
      confirmationCode: application.confirmationCode,
      feeStatus: application.feeStatus,
      documentsStatus: application.documentsStatus,
      applicationFeeEnabled: job.applicationFeeEnabled,
      requireSignedDocuments: job.requireSignedDocuments,
      signingUrl: job.signingUrl,
      jobTitle: job.title,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .innerJoin(candidate, eq(application.candidateId, candidate.id))
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .limit(1)

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Validate status transition if status is being changed
  if (body.status && body.status !== current.status) {
    const allowed = APPLICATION_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from "${current.status}" to "${body.status}". Allowed: ${allowed.join(', ') || 'none'}`,
      })
    }

    // ── Onboarding-step gates ──
    // Submission phase: the application fee must be settled — verified or
    // waived — before a job with a fee can move out of `new` into review.
    if (
      current.status === 'new'
      && (body.status === 'screening' || body.status === 'interview')
      && current.applicationFeeEnabled
      && current.feeStatus !== 'verified'
      && current.feeStatus !== 'waived'
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Verify or waive the application fee before advancing this application.',
      })
    }
    // Acceptance phase: signed documents must be verified before hiring.
    if (
      current.status === 'offer'
      && body.status === 'hired'
      && current.requireSignedDocuments
      && current.documentsStatus !== 'verified'
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Verify signed documents before marking this application hired.',
      })
    }
  }

  const [updated] = await db.update(application)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .returning({
      id: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      status: application.status,
      score: application.score,
      notes: application.notes,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== current.status ? 'status_changed' : 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: body.status && body.status !== current.status
      ? { from: current.status, to: body.status }
      : undefined,
  })

  // Track to PostHog for per-user debugging and funnel analytics
  if (body.status && body.status !== current.status) {
    trackEvent(event, session, 'application status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'application.status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })
  }

  // Acceptance / rejection emails are NOT sent automatically on a status
  // change — staff review the applicant and send them explicitly via
  // POST /api/applications/:id/send-decision-email, which also stamps the
  // sent-at marker shown in the pipeline.

  return updated
})
