import { eq, and } from 'drizzle-orm'
import { application, job, candidate } from '../../../database/schema'
import { applicationIdParamSchema, updateVerificationsSchema } from '../../../utils/schemas/application'

/**
 * PATCH /api/applications/:id/verifications
 *
 * Staff manually set the fee / signed-documents verification state on an
 * application. Setting a step to `verified` stamps who/when and (best-effort)
 * emails the applicant the matching lifecycle email. Modeled on the
 * join-request approve flow.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationInScope(session, id)
  const body = await readValidatedBody(event, updateVerificationsSchema.parse)

  // Fetch current state + everything the applicant email needs.
  const [current] = await db
    .select({
      feeStatus: application.feeStatus,
      documentsStatus: application.documentsStatus,
      confirmationCode: application.confirmationCode,
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

  const now = new Date()
  const updates: Record<string, unknown> = { updatedAt: now }

  // Both `verified` and `waived` settle a step, so both stamp who and when.
  const settles = (status: string | undefined) => status === 'verified' || status === 'waived'

  if (body.feeStatus !== undefined) {
    updates.feeStatus = body.feeStatus
    updates.feeVerifiedById = settles(body.feeStatus) ? session.user.id : null
    updates.feeVerifiedAt = settles(body.feeStatus) ? now : null
  }
  if (body.documentsStatus !== undefined) {
    updates.documentsStatus = body.documentsStatus
    updates.documentsVerifiedById = settles(body.documentsStatus) ? session.user.id : null
    updates.documentsVerifiedAt = settles(body.documentsStatus) ? now : null
  }

  const [updated] = await db.update(application)
    .set(updates)
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .returning({
      id: application.id,
      feeStatus: application.feeStatus,
      feeVerifiedAt: application.feeVerifiedAt,
      documentsStatus: application.documentsStatus,
      documentsVerifiedAt: application.documentsVerifiedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: {
      ...(body.feeStatus !== undefined ? { feeStatus: body.feeStatus } : {}),
      ...(body.documentsStatus !== undefined ? { documentsStatus: body.documentsStatus } : {}),
    },
  })

  // Best-effort lifecycle emails when a step newly settles. A waived fee gets
  // its own note — telling someone their payment is "confirmed" when they were
  // excused from paying would be wrong.
  const feeNewlyVerified = body.feeStatus === 'verified' && current.feeStatus !== 'verified'
  const feeNewlyWaived = body.feeStatus === 'waived' && current.feeStatus !== 'waived'
  const documentsNewlyVerified = body.documentsStatus === 'verified' && current.documentsStatus !== 'verified'

  if ((feeNewlyVerified || feeNewlyWaived || documentsNewlyVerified) && current.confirmationCode) {
    const origin = getRequestURL(event).origin
    const statusUrl = `${origin}/status?code=${current.confirmationCode}`
    const branding = await resolveOrgEmailBranding(orgId, origin)
    const vars = {
      candidateFirstName: current.candidateFirstName,
      candidateLastName: current.candidateLastName,
      candidateName: `${current.candidateFirstName} ${current.candidateLastName}`.trim(),
      jobTitle: current.jobTitle,
      statusUrl,
    }
    if (feeNewlyVerified) {
      void sendLifecycleEmail({
        to: current.candidateEmail,
        organizationId: orgId,
        templateType: 'fee_verified',
        vars,
        organizationName: branding.organizationName,
        logoUrl: branding.logoUrl,
      }).catch(e => console.error('[Pegasus] Failed to send fee_verified email:', e))
    }
    if (feeNewlyWaived) {
      void sendLifecycleEmail({
        to: current.candidateEmail,
        organizationId: orgId,
        templateType: 'fee_waived',
        vars,
        organizationName: branding.organizationName,
        logoUrl: branding.logoUrl,
      }).catch(e => console.error('[Pegasus] Failed to send fee_waived email:', e))
    }
    if (documentsNewlyVerified) {
      void sendLifecycleEmail({
        to: current.candidateEmail,
        organizationId: orgId,
        templateType: 'documents_verified',
        vars,
        organizationName: branding.organizationName,
        logoUrl: branding.logoUrl,
      }).catch(e => console.error('[Pegasus] Failed to send documents_verified email:', e))
    }
  }

  return updated
})
