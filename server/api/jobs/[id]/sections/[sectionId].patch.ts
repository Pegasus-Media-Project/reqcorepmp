import { eq, and } from 'drizzle-orm'
import { jobQuestionSection } from '../../../../database/schema'
import { sectionIdParamSchema, updateSectionSchema } from '../../../../utils/schemas/jobQuestion'

/**
 * PATCH /api/jobs/:id/sections/:sectionId
 * Rename / re-describe / reorder a single wizard section.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId, sectionId } = await getValidatedRouterParams(event, sectionIdParamSchema.parse)
  await assertJobInScope(session, jobId)
  const body = await readValidatedBody(event, updateSectionSchema.parse)

  const [updated] = await db.update(jobQuestionSection)
    .set({ ...body, updatedAt: new Date() })
    .where(and(
      eq(jobQuestionSection.id, sectionId),
      eq(jobQuestionSection.jobId, jobId),
      eq(jobQuestionSection.organizationId, orgId),
    ))
    .returning({
      id: jobQuestionSection.id,
      jobId: jobQuestionSection.jobId,
      title: jobQuestionSection.title,
      description: jobQuestionSection.description,
      displayOrder: jobQuestionSection.displayOrder,
      createdAt: jobQuestionSection.createdAt,
      updatedAt: jobQuestionSection.updatedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Section not found' })
  }
  return updated
})
