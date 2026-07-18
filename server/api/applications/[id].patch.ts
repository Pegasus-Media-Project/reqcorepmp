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
    // Submission phase: the application fee must be verified before a job with a
    // fee can move out of `new` into review.
    if (
      current.status === 'new'
      && (body.status === 'screening' || body.status === 'interview')
      && current.applicationFeeEnabled
      && current.feeStatus !== 'verified'
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Verify the application fee before advancing this application.',
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

  // ── Lifecycle emails on acceptance / rejection (best-effort) ──
  const statusChanged = body.status && body.status !== current.status
  if (statusChanged && (body.status === 'offer' || body.status === 'rejected') && current.confirmationCode) {
    const origin = getRequestURL(event).origin
    const statusUrl = `${origin}/status?code=${current.confirmationCode}`
    const branding = await resolveOrgEmailBranding(orgId, origin)
    const vars: Record<string, string> = {
      candidateFirstName: current.candidateFirstName,
      candidateLastName: current.candidateLastName,
      candidateName: `${current.candidateFirstName} ${current.candidateLastName}`.trim(),
      jobTitle: current.jobTitle,
      statusUrl,
      // Acceptance action link points at signing when the job requires it,
      // otherwise falls back to the status page.
      actionUrl: (current.requireSignedDocuments && current.signingUrl) ? current.signingUrl : statusUrl,
    }
    const templateType = body.status === 'offer' ? 'application_accepted' : 'application_rejected'
    void sendLifecycleEmail({
      to: current.candidateEmail,
      organizationId: orgId,
      templateType,
      vars,
      organizationName: branding.organizationName,
      logoUrl: branding.logoUrl,
    }).catch(e => console.error(`[Pegasus] Failed to send ${templateType} email:`, e))
  }

  return updated
})
