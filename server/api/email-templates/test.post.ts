import { testEmailTemplateSchema } from '../../utils/schemas/emailTemplate'
import type { SystemTemplateType } from '~~/shared/system-templates'
import { SYSTEM_TEMPLATES } from '~~/shared/system-templates'
import { resolveLifecycleTemplate, sendLifecycleEmail } from '../../utils/email'
import { generateTestBookingToken } from '../../utils/interview-token'

/**
 * POST /api/email-templates/test  { templateId } | { templateType }
 *
 * Send a test render of an email template to the CALLING staff member's own
 * address, with sample candidate data substituted, so every lifecycle email
 * can be previewed as it will actually arrive. By id it tests that exact
 * template (system or custom); by type it tests whatever the org-wide
 * resolution would send for that event.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { emailTemplate: ['read'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, testEmailTemplateSchema.parse)

  // Type for variable selection: the id's own type when testing by id.
  let templateType: SystemTemplateType = body.templateType ?? 'interview_invitation'
  if (body.templateId) {
    const system = SYSTEM_TEMPLATES.find(t => t.id === body.templateId)
    if (system) {
      templateType = system.type
    }
    else {
      const custom = await db.query.emailTemplate.findFirst({
        where: (t, { and, eq }) => and(eq(t.id, body.templateId!), eq(t.organizationId, orgId)),
        columns: { templateType: true },
      })
      if (!custom) {
        throw createError({ statusCode: 404, statusMessage: 'Template not found' })
      }
      templateType = custom.templateType as SystemTemplateType
    }
  }

  const template = await resolveLifecycleTemplate(orgId, templateType, body.templateId)
  if (!template) {
    throw createError({ statusCode: 422, statusMessage: 'No template found for this event.' })
  }

  const origin = getRequestURL(event).origin
  const branding = await resolveOrgEmailBranding(orgId, origin)
  const orgName = branding.organizationName?.trim() || 'Pegasus Media Project'

  // Self-schedule tests get a REAL booking link when a job is given: it opens
  // the actual booking page with that job's live availability, in a test mode
  // where nothing can be booked — so the whole flow can be walked through.
  let bookingUrl = `${origin}/interview/book?token=sample`
  let expiresAt = 'Friday, March 20, 2026'
  if (body.jobId) {
    const jobRow = await db.query.job.findFirst({
      where: (j, { and, eq }) => and(eq(j.id, body.jobId!), eq(j.organizationId, orgId)),
      columns: { id: true },
    })
    if (!jobRow) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' })
    }
    await assertJobInScope(session, body.jobId)
    const token = generateTestBookingToken(body.jobId, env.BETTER_AUTH_SECRET)
    bookingUrl = `${origin}/interview/book?token=${encodeURIComponent(token)}`
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  // Sample values covering every placeholder any template type may use.
  const vars: Record<string, string> = {
    candidateName: 'Alex Johnson',
    candidateFirstName: 'Alex',
    candidateLastName: 'Johnson',
    candidateEmail: 'alex@example.com',
    jobTitle: 'Senior Frontend Engineer',
    interviewTitle: 'Technical Interview — Round 2',
    interviewDate: 'Monday, March 16, 2026',
    interviewTime: '2:00 PM',
    interviewDuration: '60',
    interviewType: 'Video Call',
    interviewLocation: 'https://meet.google.com/abc-defg-hij',
    interviewers: 'Sarah Chen, Michael Park',
    organizationName: orgName,
    statusUrl: `${origin}/status?code=SAMPLE1`,
    actionUrl: `${origin}/status?code=SAMPLE1`,
    bookingUrl,
    expiresAt,
  }

  await sendLifecycleEmail({
    to: session.user.email,
    organizationId: orgId,
    templateType,
    templateId: body.templateId,
    vars,
    organizationName: orgName,
    logoUrl: branding.logoUrl,
    subjectPrefix: '[Test] ',
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'email_template',
    resourceId: body.templateId ?? templateType,
    metadata: { action: 'test_email_sent', templateType },
  })

  return { success: true, to: session.user.email, templateType }
})
