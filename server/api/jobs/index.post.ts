import { and, eq } from 'drizzle-orm'
import { job, jobQuestion, jobQuestionSection, scoringCriterion, program } from '../../database/schema'
import { createJobWizardSchema } from '../../utils/schemas/job'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createJobWizardSchema.parse)

  // Opening a role counts against the plan's active-role limit.
  if (body.status === 'open') {
    await assertActiveRoleLimit(orgId)
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

  // Generate a deterministic ID upfront so we can build the slug
  const jobId = crypto.randomUUID()
  const slug = generateJobSlug(body.title, jobId, body.slug)

  const created = await db.transaction(async (tx) => {
    const [createdJob] = await tx.insert(job).values({
      id: jobId,
      organizationId: orgId,
      programId: body.programId ?? null,
      title: body.title,
      slug,
      description: body.description,
      location: body.location,
      type: body.type,
      status: body.status,
      salaryMin: body.salaryMin,
      salaryMax: body.salaryMax,
      salaryCurrency: body.salaryCurrency,
      salaryUnit: body.salaryUnit,
      salaryNegotiable: body.salaryNegotiable,
      remoteStatus: body.remoteStatus,
      validThrough: body.validThrough,
      phoneRequirement: body.phoneRequirement,
      requireResume: body.requireResume,
      requireCoverLetter: body.requireCoverLetter,
      applicationFeeEnabled: body.applicationFeeEnabled,
      applicationFeeUrl: body.applicationFeeUrl,
      applicationFeeAmount: body.applicationFeeAmount,
      applicationFeeCurrency: body.applicationFeeCurrency,
      requireSignedDocuments: body.requireSignedDocuments,
      signingUrl: body.signingUrl,
      autoScoreOnApply: body.autoScoreOnApply,
      experienceLevel: body.experienceLevel,
    }).returning({
      id: job.id,
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
      autoScoreOnApply: job.autoScoreOnApply,
      experienceLevel: job.experienceLevel,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })

    if (!createdJob) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create job' })
    }

    // Create sections first so questions can reference their real ids. The
    // wizard sends a client-side `ref` per section; build ref → real id.
    const sectionRefToId = new Map<string, string>()
    if (body.sections.length) {
      const insertedSections = await tx.insert(jobQuestionSection).values(
        body.sections.map((section, index) => ({
          organizationId: orgId,
          jobId,
          title: section.title,
          description: section.description ?? null,
          displayOrder: index,
        })),
      ).returning({ id: jobQuestionSection.id })
      body.sections.forEach((section, index) => {
        const created = insertedSections[index]
        if (created) sectionRefToId.set(section.ref, created.id)
      })
    }

    if (body.questions.length) {
      await tx.insert(jobQuestion).values(body.questions.map((question, index) => ({
        organizationId: orgId,
        jobId,
        // `sectionId` from the wizard holds a section ref; map it to the real id.
        sectionId: question.sectionId ? sectionRefToId.get(question.sectionId) ?? null : null,
        type: question.type,
        label: question.label,
        description: question.description,
        content: question.content,
        required: question.required,
        options: question.options,
        displayOrder: index,
      })))
    }

    if (body.criteria.length) {
      await tx.insert(scoringCriterion).values(body.criteria.map((criterion, index) => ({
        organizationId: orgId,
        jobId,
        key: criterion.key,
        name: criterion.name,
        description: criterion.description ?? null,
        category: criterion.category,
        maxScore: criterion.maxScore,
        weight: criterion.weight,
        displayOrder: index,
      })))
    }

    return createdJob
  })

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create job' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'job',
    resourceId: created.id,
    metadata: { title: created.title },
  })

  trackEvent(event, session, 'job created', {
    job_id: created.id,
    job_type: created.type,
    has_salary: !!(created.salaryMin || created.salaryMax),
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  logApiRequest(event, session, 'job.created', {
    job_id: created.id,
    job_type: created.type,
    has_salary: !!(created.salaryMin || created.salaryMax),
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  setResponseStatus(event, 201)
  return created
})
