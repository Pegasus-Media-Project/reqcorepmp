import { and, eq } from 'drizzle-orm'
import * as schema from '../../database/schema'

/**
 * Public live-demo entry point.
 *
 * Signs the visitor into the read-only demo account, resolves the seeded
 * showcase records dynamically, and opens the exact table + AI analysis view.
 * The lookup avoids brittle IDs because demo IDs change whenever data is reseeded.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')

  const config = useRuntimeConfig()
  const demoEmail = (config.public.liveDemoEmail as string) || 'demo@reqcore.com'
  const demoPassword = (config.public.liveDemoPasscode as string) || 'demo1234'
  const demoOrgSlug = (config.public.demoOrgSlug as string) || 'reqcore-demo'

  const [showcase] = await db
    .select({
      jobId: schema.job.id,
      applicationId: schema.application.id,
    })
    .from(schema.application)
    .innerJoin(schema.job, eq(schema.application.jobId, schema.job.id))
    .innerJoin(schema.candidate, eq(schema.application.candidateId, schema.candidate.id))
    .innerJoin(schema.organization, eq(schema.job.organizationId, schema.organization.id))
    .where(and(
      eq(schema.organization.slug, demoOrgSlug),
      eq(schema.job.title, 'Senior Full-Stack Engineer'),
      eq(schema.candidate.email, 'emma.schmidt@example.com'),
    ))
    .limit(1)

  if (!showcase) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The live demo is being prepared. Please try again shortly.',
    })
  }

  const signInResponse = await auth.api.signInEmail({
    body: {
      email: demoEmail,
      password: demoPassword,
      rememberMe: false,
    },
    headers: event.headers,
    asResponse: true,
  })

  for (const cookie of signInResponse.headers.getSetCookie()) {
    appendResponseHeader(event, 'set-cookie', cookie)
  }

  const target = `/dashboard/jobs/${showcase.jobId}/candidates`
    + `?application=${encodeURIComponent(showcase.applicationId)}`
    + '&tab=ai_analysis&demo=showcase'

  return sendRedirect(event, target)
})
