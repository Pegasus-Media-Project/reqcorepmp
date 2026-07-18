import { eq } from 'drizzle-orm'
import { organization, careerPage } from '../database/schema'

export interface OrgEmailBranding {
  organizationName?: string
  /** Absolute https URL of the org/career-page logo, for email headers. */
  logoUrl?: string
}

/**
 * Resolve an organization's display name and an absolute logo URL for use in
 * applicant-facing emails. Prefers the branded career-page logo (served
 * publicly), falling back to the org logo when it's already an absolute URL.
 *
 * Mirrors the resolution the public apply endpoint does inline, extracted so
 * the confirmation, acceptance/rejection, and verification emails stay
 * consistent.
 */
export async function resolveOrgEmailBranding(orgId: string, origin: string): Promise<OrgEmailBranding> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true, logo: true, slug: true },
  })
  const cp = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: { slug: true, logoStorageKey: true, updatedAt: true, enabled: true },
  })

  let logoUrl: string | undefined
  const cpSlug = cp?.slug ?? org?.slug ?? null
  if (cp?.logoStorageKey && cpSlug && (cp.enabled ?? true)) {
    logoUrl = `${origin}/api/public/career-page/${cpSlug}/asset?kind=logo&v=${new Date(cp.updatedAt).getTime()}`
  }
  else if (org?.logo && /^https?:\/\//i.test(org.logo)) {
    logoUrl = org.logo
  }

  return { organizationName: org?.name ?? undefined, logoUrl }
}
