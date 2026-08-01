import { eq, and } from 'drizzle-orm'
import { application, candidate, job, comment, propertyValue } from '../../database/schema'
import { applicationIdParamSchema } from '../../utils/schemas/application'

/**
 * DELETE /api/applications/:id
 *
 * Remove one application — the wrong job, a duplicate, a test submission. The
 * candidate is left alone: they may have applied for other roles, and their
 * documents belong to them rather than to any one application.
 *
 * Everything keyed to the application by a foreign key (answers, interviews,
 * reviews, bookings, AI runs, source attribution) goes with it on cascade. The
 * two tables that point at applications polymorphically — comments and custom
 * property values — have no cascade to rely on, so they're cleared here.
 *
 * The activity-log entry is written first and deliberately survives: it is the
 * record that this application existed and who removed it.
 *
 * Owner/admin only — `application: ['delete']` is not granted to members.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationInScope(session, id)

  // Read the details worth keeping in the audit trail before they're gone.
  const [existing] = await db
    .select({
      id: application.id,
      status: application.status,
      jobId: application.jobId,
      jobTitle: job.title,
      candidateId: application.candidateId,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      createdAt: application.createdAt,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .innerJoin(candidate, eq(application.candidateId, candidate.id))
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  await recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'application',
    resourceId: id,
    metadata: {
      jobId: existing.jobId,
      jobTitle: existing.jobTitle,
      candidateId: existing.candidateId,
      candidateName: `${existing.candidateFirstName} ${existing.candidateLastName}`.trim(),
      candidateEmail: existing.candidateEmail,
      status: existing.status,
      appliedAt: existing.createdAt.toISOString(),
    },
  })

  await db.transaction(async (tx) => {
    await tx.delete(comment).where(and(
      eq(comment.organizationId, orgId),
      eq(comment.targetType, 'application'),
      eq(comment.targetId, id),
    ))
    await tx.delete(propertyValue).where(and(
      eq(propertyValue.organizationId, orgId),
      eq(propertyValue.entityType, 'application'),
      eq(propertyValue.entityId, id),
    ))
    await tx.delete(application).where(and(
      eq(application.id, id),
      eq(application.organizationId, orgId),
    ))
  })

  return {
    deleted: true,
    id,
    candidateId: existing.candidateId,
    jobId: existing.jobId,
  }
})
