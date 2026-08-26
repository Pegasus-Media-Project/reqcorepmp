import { eq, and } from 'drizzle-orm'
import { application, job, candidate } from '../../../database/schema'
import { applicationIdParamSchema, sendDecisionEmailSchema } from '../../../utils/schemas/application'
import { resolveLifecycleTemplate, sendLifecycleEmail } from '../../../utils/email'

/**
 * POST /api/applications/:id/send-decision-email  { type: 'accepted' | 'rejected' }
 *
 * Manually send the acceptance or rejection email for an application. Nothing
 * is sent automatically on a status change — staff move the applicant to the
 * stage, then send (or re-send) the email explicitly. The template resolves
 * per-job first (job.accepted/rejectedTemplateId), then the org's custom
 * template for the type, then the built-in default. Stamps
 * accepted/rejectedEmailSentAt, which drives the sent-state chip in the UI.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationInScope(session, id)
  const body = await readValidatedBody(event, sendDecisionEmailSchema.parse)

  const [current] = await db
    .select({
      id: application.id,
      status: application.status,
      confirmationCode: application.confirmationCode,
      jobTitle: job.title,
      requireSignedDocuments: job.requireSignedDocuments,
      signingUrl: job.signingUrl,
      acceptedTemplateId: job.acceptedTemplateId,
      rejectedTemplateId: job.rejectedTemplateId,
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

  // The email must match where the applicant actually is in the pipeline.
  if (body.type === 'accepted' && current.status !== 'offer' && current.status !== 'hired') {
    throw createError({ statusCode: 422, statusMessage: 'The acceptance email can only be sent once the applicant is in the Offer (or Hired) stage.' })
  }
  if (body.type === 'rejected' && current.status !== 'rejected') {
    throw createError({ statusCode: 422, statusMessage: 'The rejection email can only be sent once the applicant is in the Rejected stage.' })
  }
  if (!current.candidateEmail) {
    throw createError({ statusCode: 422, statusMessage: 'This candidate has no email address.' })
  }

  const templateType = body.type === 'accepted' ? 'application_accepted' : 'application_rejected'
  const templateId = body.type === 'accepted' ? current.acceptedTemplateId : current.rejectedTemplateId

  // Resolve up front so a missing template is a visible error, not a silent no-op.
  const template = await resolveLifecycleTemplate(orgId, templateType, templateId)
  if (!template) {
    throw createError({ statusCode: 422, statusMessage: 'No email template is configured for this event.' })
  }

  const origin = getRequestURL(event).origin
  const statusUrl = current.confirmationCode ? `${origin}/status?code=${current.confirmationCode}` : `${origin}/status`
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

  await sendLifecycleEmail({
    to: current.candidateEmail,
    organizationId: orgId,
    templateType,
    templateId,
    vars,
    organizationName: branding.organizationName,
    logoUrl: branding.logoUrl,
  })

  const sentAt = new Date()
  await db.update(application)
    .set(body.type === 'accepted'
      ? { acceptedEmailSentAt: sentAt, updatedAt: sentAt }
      : { rejectedEmailSentAt: sentAt, updatedAt: sentAt })
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: { action: `${body.type}_email_sent`, candidateEmail: current.candidateEmail },
  })

  return { success: true, sentAt, to: current.candidateEmail }
})
