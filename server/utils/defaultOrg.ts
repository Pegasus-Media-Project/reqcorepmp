import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from './db'
import { organization, member } from '../database/schema'

/**
 * Single-organization deployment.
 *
 * Instead of every account creating or picking its own organization, all users
 * join one shared org ("Pegasus Media Project"). The first person to sign up
 * creates the org and becomes its `owner`; everyone after joins as a `member`.
 * Promote members to admin/owner from Settings → Members.
 *
 * The org name/slug can be overridden with the DEFAULT_ORG_NAME / DEFAULT_ORG_SLUG
 * env vars (handy if you fork this for a different brand).
 */
export const DEFAULT_ORG_NAME = process.env.DEFAULT_ORG_NAME || 'Pegasus Media Project'
export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG_PRIMARY || 'pegasus'

/**
 * Ensure `userId` belongs to the shared default org, creating the org on the
 * very first signup. Idempotent (safe to call repeatedly) and race-safe against
 * concurrent first signups. Returns the org id.
 */
export async function ensureDefaultOrgMembership(userId: string): Promise<string> {
  let [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, DEFAULT_ORG_SLUG))
    .limit(1)

  // The user who creates the org row becomes its owner; everyone else is a member.
  let createdOrg = false

  if (!org) {
    const id = randomUUID()
    const inserted = await db
      .insert(organization)
      .values({ id, name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG })
      .onConflictDoNothing({ target: organization.slug })
      .returning({ id: organization.id })

    if (inserted.length > 0) {
      org = inserted[0]
      createdOrg = true
    } else {
      // Lost a concurrent create race — read back the row the winner inserted.
      ;[org] = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, DEFAULT_ORG_SLUG))
        .limit(1)
    }
  }

  await db
    .insert(member)
    .values({
      id: randomUUID(),
      userId,
      organizationId: org!.id,
      role: createdOrg ? 'owner' : 'member',
    })
    .onConflictDoNothing()

  return org!.id
}

/** The org a user should be active in — their first (in single-org setups, only) membership. */
export async function getUserPrimaryOrgId(userId: string): Promise<string | null> {
  const [m] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1)
  return m?.organizationId ?? null
}
