import { eq, and } from 'drizzle-orm'
import { emailTemplate } from '../../database/schema'
import { emailTemplateQuerySchema } from '../../utils/schemas/emailTemplate'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { emailTemplate: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { type } = await getValidatedQuery(event, emailTemplateQuerySchema.parse)

  const templates = await db.query.emailTemplate.findMany({
    where: type
      ? and(eq(emailTemplate.organizationId, orgId), eq(emailTemplate.templateType, type))
      : eq(emailTemplate.organizationId, orgId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })

  return templates
})
