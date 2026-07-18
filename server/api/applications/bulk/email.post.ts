import { and, eq, inArray } from 'drizzle-orm'
import { application, job, candidate, organization, careerPage } from '../../../database/schema'
import { bulkEmailSchema } from '../../../utils/schemas/application'
import { sendBulkApplicantEmail, renderTemplateGeneric } from '../../../utils/email'

/**
 * POST /api/applications/bulk/email
 *
 * NOTE on the path: this deliberately lives at `bulk/email`, not `bulk-email`.
 * A literal single-segment sibling of `/api/applications/:id` would join
 * Nuxt's typed-fetch union for `/api/applications/${string}` and, being
 * POST-only, collapse the inferred GET data type to `{}` for every consumer
 * of the application-detail endpoint.
 *
 * Send a custom, templated email to a hand-picked set of applications. The
 * subject/body may contain {{candidateName}}, {{candidateFirstName}},
 * {{jobTitle}}, {{organizationName}} placeholders, rendered per recipient.
 *
 * Recipients are de-duplicated by email; applicants without an email are
 * skipped. Sends are throttled (small concurrency pool) to respect provider
 * limits, and each successful send is recorded in the activity log.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, bulkEmailSchema.parse)

  // Fetch the selected applications (scoped to this org) with candidate + job.
  const rows = await db
    .select({
      applicationId: application.id,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobTitle: job.title,
    })
    .from(application)
    .innerJoin(candidate, eq(application.candidateId, candidate.id))
    .innerJoin(job, eq(application.jobId, job.id))
    .where(and(
      eq(application.organizationId, orgId),
      inArray(application.id, body.applicationIds),
    ))

  // Resolve org name + logo once (shared across all recipients).
  const origin = getRequestURL(event).origin
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true, logo: true, slug: true },
  })
  const cp = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: { slug: true, logoStorageKey: true, updatedAt: true, enabled: true },
  })
  const orgName = org?.name?.trim() || 'Pegasus Media Project'
  let logoUrl: string | undefined
  const cpSlug = cp?.slug ?? org?.slug ?? null
  if (cp?.logoStorageKey && cpSlug && (cp.enabled ?? true)) {
    logoUrl = `${origin}/api/public/career-page/${cpSlug}/asset?kind=logo&v=${new Date(cp.updatedAt).getTime()}`
  } else if (org?.logo && /^https?:\/\//i.test(org.logo)) {
    logoUrl = org.logo
  }

  // De-duplicate by email (a candidate may appear on multiple selected
  // applications); skip applicants with no email address.
  const seen = new Set<string>()
  const recipients: typeof rows = []
  let skippedNoEmail = 0
  for (const r of rows) {
    const email = r.candidateEmail?.trim().toLowerCase()
    if (!email) {
      skippedNoEmail++
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    recipients.push(r)
  }

  // Send with a small concurrency pool to respect provider rate limits.
  const CONCURRENCY = 5
  let sent = 0
  let failed = 0

  async function sendOne(r: typeof rows[number]): Promise<void> {
    const candidateName = `${r.candidateFirstName} ${r.candidateLastName}`.trim()
    const vars: Record<string, string> = {
      candidateName,
      candidateFirstName: r.candidateFirstName,
      candidateLastName: r.candidateLastName,
      jobTitle: r.jobTitle,
      organizationName: orgName,
    }
    try {
      await sendBulkApplicantEmail({
        to: r.candidateEmail,
        subject: renderTemplateGeneric(body.subject, vars),
        body: renderTemplateGeneric(body.body, vars),
        organizationName: orgName,
        logoUrl,
      })
      sent++
      void recordActivity({
        organizationId: orgId,
        actorId: session.user.id,
        action: 'updated',
        resourceType: 'application',
        resourceId: r.applicationId,
        metadata: { action: 'bulk_email_sent', subject: body.subject },
      })
    }
    catch {
      // Transport error already logged inside sendEmail — tally and continue.
      failed++
    }
  }

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    await Promise.all(recipients.slice(i, i + CONCURRENCY).map(sendOne))
  }

  trackEvent(event, session, 'application bulk_email_sent', {
    requested: body.applicationIds.length,
    recipients: recipients.length,
    sent,
    failed,
    skipped_no_email: skippedNoEmail,
  })

  return {
    success: true,
    requested: body.applicationIds.length,
    recipients: recipients.length,
    sent,
    failed,
    skippedNoEmail,
  }
})
