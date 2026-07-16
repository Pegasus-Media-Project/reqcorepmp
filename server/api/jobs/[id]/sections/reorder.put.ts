import { eq, and } from 'drizzle-orm'
import { job, jobQuestionSection } from '../../../../database/schema'
import { jobIdParamSchema, reorderSectionsSchema } from '../../../../utils/schemas/jobQuestion'

/**
 * PUT /api/jobs/:id/sections/reorder
 * Bulk-update the display order of a job's wizard sections.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId } = await getValidatedRouterParams(event, jobIdParamSchema.parse)
  await assertJobInScope(session, jobId)
  const body = await readValidatedBody(event, reorderSectionsSchema.parse)

  const existingJob = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existingJob) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  await db.transaction(async (tx) => {
    for (const { id, displayOrder } of body.order) {
      await tx.update(jobQuestionSection)
        .set({ displayOrder, updatedAt: new Date() })
        .where(and(
          eq(jobQuestionSection.id, id),
          eq(jobQuestionSection.jobId, jobId),
          eq(jobQuestionSection.organizationId, orgId),
        ))
    }
  })

  return { success: true }
})
