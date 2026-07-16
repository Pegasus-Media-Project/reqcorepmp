import { eq, and } from 'drizzle-orm'
import { job, jobQuestionSection } from '../../../../database/schema'
import { jobIdParamSchema, createSectionSchema } from '../../../../utils/schemas/jobQuestion'

/**
 * POST /api/jobs/:id/sections
 * Create a new wizard section (page) for a job.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, jobIdParamSchema.parse)
  await assertJobInScope(session, jobId)
  const body = await readValidatedBody(event, createSectionSchema.parse)

  const existingJob = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existingJob) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const [created] = await db.insert(jobQuestionSection).values({
    organizationId: orgId,
    jobId,
    title: body.title,
    description: body.description ?? null,
    displayOrder: body.displayOrder,
  }).returning({
    id: jobQuestionSection.id,
    jobId: jobQuestionSection.jobId,
    title: jobQuestionSection.title,
    description: jobQuestionSection.description,
    displayOrder: jobQuestionSection.displayOrder,
    createdAt: jobQuestionSection.createdAt,
    updatedAt: jobQuestionSection.updatedAt,
  })

  setResponseStatus(event, 201)
  return created
})
