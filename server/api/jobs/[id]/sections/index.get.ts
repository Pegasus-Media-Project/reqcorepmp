import { eq, and, asc } from 'drizzle-orm'
import { job, jobQuestionSection } from '../../../../database/schema'
import { jobIdParamSchema } from '../../../../utils/schemas/jobQuestion'

/**
 * GET /api/jobs/:id/sections
 * List the wizard sections (pages) configured for a job, in display order.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, jobIdParamSchema.parse)
  await assertJobInScope(session, jobId)

  const existingJob = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existingJob) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  return db.query.jobQuestionSection.findMany({
    where: and(eq(jobQuestionSection.jobId, jobId), eq(jobQuestionSection.organizationId, orgId)),
    orderBy: [asc(jobQuestionSection.displayOrder), asc(jobQuestionSection.createdAt)],
    columns: {
      id: true,
      jobId: true,
      title: true,
      description: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  })
})
