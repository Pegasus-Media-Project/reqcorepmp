import { eq, and } from 'drizzle-orm'
import { job, program } from '../../database/schema'
import { idParamSchema, updateJobSchema, JOB_STATUS_TRANSITIONS } from '../../utils/schemas/job'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, updateJobSchema.parse)

  // Scoped members may only edit jobs they manage.
  await assertJobInScope(session, id)

  // Fetch existing job — needed for status transition check, slug regeneration,
  // and validating the fee/signing "enabled requires a URL" rule against the
  // merged (existing + patch) state.
  const existing = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: {
      status: true, title: true, slug: true,
      applicationFeeEnabled: true, applicationFeeUrl: true,
      requireSignedDocuments: true, signingUrl: true,
    },
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Fee/signing can't be enabled without a destination link (checked on the
  // merged state so a PATCH that only flips the toggle still validates).
  const feeEnabled = body.applicationFeeEnabled ?? existing.applicationFeeEnabled
  const feeUrl = body.applicationFeeUrl === undefined ? existing.applicationFeeUrl : body.applicationFeeUrl
  if (feeEnabled && !feeUrl) {
    throw createError({ statusCode: 422, statusMessage: 'A payment link is required when the application fee is enabled' })
  }
  const signingRequired = body.requireSignedDocuments ?? existing.requireSignedDocuments
  const signingUrl = body.signingUrl === undefined ? existing.signingUrl : body.signingUrl
  if (signingRequired && !signingUrl) {
    throw createError({ statusCode: 422, statusMessage: 'A signing link is required when signed documents are required' })
  }

  // A program can only be attached if it belongs to this org.
  if (body.programId) {
    const programRow = await db.query.program.findFirst({
      where: and(eq(program.id, body.programId), eq(program.organizationId, orgId)),
      columns: { id: true },
    })
    if (!programRow) {
      throw createError({ statusCode: 422, statusMessage: 'Program not found' })
    }
  }

  // Validate status transition if status is being changed
  if (body.status) {
    const allowed = JOB_STATUS_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from '${existing.status}' to '${body.status}'`,
      })
    }

    // Re-opening a role counts against the plan's active-role limit.
    if (body.status === 'open' && existing.status !== 'open') {
      await assertActiveRoleLimit(orgId)
    }
  }

  // Regenerate slug when title or custom slug changes
  const updates: Record<string, unknown> = { ...body, updatedAt: new Date() }
  delete (updates as any).slug // remove raw slug from spread — we set it explicitly below
  if (body.title || body.slug) {
    updates.slug = generateJobSlug(body.title ?? existing.title, id, body.slug)
  }

  const [updated] = await db.update(job)
    .set(updates)
    .where(and(eq(job.id, id), eq(job.organizationId, orgId)))
    .returning({
      id: job.id,
      programId: job.programId,
      title: job.title,
      slug: job.slug,
      description: job.description,
      location: job.location,
      type: job.type,
      status: job.status,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryUnit: job.salaryUnit,
      salaryNegotiable: job.salaryNegotiable,
      remoteStatus: job.remoteStatus,
      validThrough: job.validThrough,
      phoneRequirement: job.phoneRequirement,
      requireResume: job.requireResume,
      requireCoverLetter: job.requireCoverLetter,
      hideApplicationQuestions: job.hideApplicationQuestions,
      applicationQuestionsPdfUrl: job.applicationQuestionsPdfUrl,
      applicationFeeEnabled: job.applicationFeeEnabled,
      applicationFeeUrl: job.applicationFeeUrl,
      applicationFeeAmount: job.applicationFeeAmount,
      applicationFeeCurrency: job.applicationFeeCurrency,
      requireSignedDocuments: job.requireSignedDocuments,
      signingUrl: job.signingUrl,
      autoScoreOnApply: job.autoScoreOnApply,
      analysisContext: job.analysisContext,
      experienceLevel: job.experienceLevel,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== existing.status ? 'status_changed' : 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: body.status && body.status !== existing.status
      ? { from: existing.status, to: body.status }
      : { title: updated.title },
  })

  if (body.status && body.status !== existing.status) {
    trackEvent(event, session, 'job status_changed', {
      job_id: id,
      from_status: existing.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'job.status_changed', {
      job_id: id,
      from_status: existing.status,
      to_status: body.status,
    })
  }

  return updated
})
