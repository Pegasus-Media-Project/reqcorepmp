import { and, eq } from 'drizzle-orm'
import { job, jobInterviewAvailability } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { invitationTemplatePatchSchema } from '../../../utils/schemas/interviewSlot'

/**
 * PATCH /api/jobs/:id/invitation-template  { invitationTemplateId }
 *
 * Update only the self-schedule invitation template on the job's interview
 * availability (the same field the interview-slots modal saves), without
 * regenerating any slots. Requires availability to exist — the schedule itself
 * is configured in the slots modal.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertPlanFeature(orgId, 'interviews')

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, invitationTemplatePatchSchema.parse)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRow) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  await assertJobInScope(session, id)

  const [updated] = await db.update(jobInterviewAvailability)
    .set({ invitationTemplateId: body.invitationTemplateId, updatedAt: new Date() })
    .where(and(
      eq(jobInterviewAvailability.jobId, id),
      eq(jobInterviewAvailability.organizationId, orgId),
    ))
    .returning({ id: jobInterviewAvailability.id })

  if (!updated) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Set up interview availability first (Manage availability & interview slots).',
    })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: { action: 'invitation_template_changed', invitationTemplateId: body.invitationTemplateId },
  })

  return { success: true, invitationTemplateId: body.invitationTemplateId }
})
