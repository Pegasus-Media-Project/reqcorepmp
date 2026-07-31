import { eq, and, asc } from 'drizzle-orm'
import { job, jobQuestion, jobQuestionSection, organization } from '../../../database/schema'
import { idParamSchema } from '../../../utils/schemas/job'
import { buildQuestionnaireDocx } from '../../../utils/exports/questionnaireDocument'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'job'
}

/**
 * GET /api/jobs/:id/questionnaire.docx
 *
 * The job's blank application form as an editable Word document — the handout
 * version of the questions, generated from the live form so the two can't
 * drift. A GET so it can be a plain download link.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  await assertJobInScope(session, id)

  const jobRow = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: {
      title: true,
      phoneRequirement: true,
      requireResume: true,
      requireCoverLetter: true,
    },
  })
  if (!jobRow) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const [sections, questions, org] = await Promise.all([
    db.select({
      id: jobQuestionSection.id,
      title: jobQuestionSection.title,
      description: jobQuestionSection.description,
      displayOrder: jobQuestionSection.displayOrder,
    })
      .from(jobQuestionSection)
      .where(and(eq(jobQuestionSection.jobId, id), eq(jobQuestionSection.organizationId, orgId)))
      .orderBy(asc(jobQuestionSection.displayOrder), asc(jobQuestionSection.createdAt)),
    db.select({
      id: jobQuestion.id,
      type: jobQuestion.type,
      label: jobQuestion.label,
      description: jobQuestion.description,
      content: jobQuestion.content,
      required: jobQuestion.required,
      options: jobQuestion.options,
      config: jobQuestion.config,
      sectionId: jobQuestion.sectionId,
      displayOrder: jobQuestion.displayOrder,
    })
      .from(jobQuestion)
      .where(and(eq(jobQuestion.jobId, id), eq(jobQuestion.organizationId, orgId)))
      .orderBy(asc(jobQuestion.displayOrder), asc(jobQuestion.createdAt)),
    db.query.organization.findFirst({ where: eq(organization.id, orgId), columns: { name: true } }),
  ])

  const docx = await buildQuestionnaireDocx({
    jobTitle: jobRow.title,
    organizationName: org?.name ?? null,
    phoneRequirement: jobRow.phoneRequirement,
    requireResume: jobRow.requireResume,
    requireCoverLetter: jobRow.requireCoverLetter,
    sections,
    questions,
  })

  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="${slugify(jobRow.title)}-application-form.docx"`,
  })
  return docx
})
