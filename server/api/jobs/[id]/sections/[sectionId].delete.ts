import { eq, and } from 'drizzle-orm'
import { jobQuestionSection } from '../../../../database/schema'
import { sectionIdParamSchema } from '../../../../utils/schemas/jobQuestion'

/**
 * DELETE /api/jobs/:id/sections/:sectionId
 * Remove a section. Its questions fall back to the default page (the FK sets
 * their sectionId to NULL on delete).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id: jobId, sectionId } = await getValidatedRouterParams(event, sectionIdParamSchema.parse)
  await assertJobInScope(session, jobId)

  const [deleted] = await db.delete(jobQuestionSection)
    .where(and(
      eq(jobQuestionSection.id, sectionId),
      eq(jobQuestionSection.jobId, jobId),
      eq(jobQuestionSection.organizationId, orgId),
    ))
    .returning({ id: jobQuestionSection.id })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Section not found' })
  }

  setResponseStatus(event, 204)
  return null
})
