/**
 * ─────────────────────────────────────────────
 * Centralized Access Control — single source of truth
 * ─────────────────────────────────────────────
 *
 * This file defines EVERY permission in the system.  It is imported by
 * both the server (auth.ts) and the client (auth-client.ts) so roles
 * and statements are always in sync.
 *
 * Design principles:
 *   • Deny by default — if a permission isn't listed here, it's denied.
 *   • Three built-in roles only (owner / admin / member) — no custom ones.
 *   • Import from `better-auth/plugins/access` to keep bundle small.
 *   • Merge with `defaultStatements` so Better Auth's own org/member/invitation
 *     permissions are preserved alongside our ATS-specific ones.
 */

import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access'

// ─── ATS-specific resource → action map ────────────────────────────
// Every resource the app manages is declared here with its allowed actions.
// `as const` is mandatory for TypeScript inference.

const atsStatements = {
  organization: ['read', 'update', 'delete'],
  program: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read', 'update', 'delete'],
  candidate: ['create', 'read', 'update', 'delete'],
  application: ['create', 'read', 'update', 'delete'],
  document: ['create', 'read', 'update', 'delete'],
  comment: ['create', 'read', 'update', 'delete'],
  review: ['create', 'read', 'update', 'delete'],
  interview: ['create', 'read', 'update', 'delete'],
  emailTemplate: ['create', 'read', 'update', 'delete'],
  activityLog: ['read'],
  scoring: ['create', 'read', 'update', 'delete'],
  sourceTracking: ['create', 'read', 'update', 'delete'],
} as const

// ─── Merged statement (Better Auth defaults + ATS resources) ───────
export const statements = {
  ...defaultStatements,
  ...atsStatements,
} as const

// ─── Access Controller ─────────────────────────────────────────────
export const ac = createAccessControl(statements)

// ─── Role definitions ──────────────────────────────────────────────
//
// owner   — org creator.  EVERYTHING including delete org / manage billing.
// admin   — hiring managers.  Full CRUD on ATS resources + invite members.
// member  — recruiters.  Read jobs, manage candidates/applications in pipeline.
// guest   — external reviewers.  Read-only on the applicant data of the jobs
//           they're individually assigned to, plus their own reviews/comments.
//           No org-wide visibility, no pipeline management, no settings.

export const owner = ac.newRole({
  ...ownerAc.statements,
  organization: ['read', 'update', 'delete'],
  program: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read', 'update', 'delete'],
  candidate: ['create', 'read', 'update', 'delete'],
  application: ['create', 'read', 'update', 'delete'],
  document: ['create', 'read', 'update', 'delete'],
  comment: ['create', 'read', 'update', 'delete'],
  review: ['create', 'read', 'update', 'delete'],
  interview: ['create', 'read', 'update', 'delete'],
  emailTemplate: ['create', 'read', 'update', 'delete'],
  activityLog: ['read'],
  scoring: ['create', 'read', 'update', 'delete'],
  sourceTracking: ['create', 'read', 'update', 'delete'],
})

export const admin = ac.newRole({
  ...adminAc.statements,
  organization: ['read', 'update', 'delete'],
  program: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read', 'update', 'delete'],
  candidate: ['create', 'read', 'update', 'delete'],
  application: ['create', 'read', 'update', 'delete'],
  document: ['create', 'read', 'update', 'delete'],
  comment: ['create', 'read', 'update', 'delete'],
  review: ['create', 'read', 'update', 'delete'],
  interview: ['create', 'read', 'update', 'delete'],
  emailTemplate: ['create', 'read', 'update', 'delete'],
  activityLog: ['read'],
  scoring: ['create', 'read', 'update', 'delete'],
  sourceTracking: ['create', 'read', 'update', 'delete'],
})

export const member = ac.newRole({
  ...memberAc.statements,
  organization: ['read'],
  program: ['read'],
  // Members can read all programs, but managing jobs is SCOPED per assignment:
  // the RBAC capability here only clears the first gate — server routes then
  // narrow to the member's assigned programs/jobs via `assertJobInScope`.
  // Creating jobs stays owner/admin-only.
  job: ['read', 'update', 'delete'],
  candidate: ['create', 'read', 'update'],
  application: ['create', 'read', 'update'],
  document: ['create', 'read'],
  // update/delete are author-scoped in server/api/comments/[id].{patch,delete}.ts
  comment: ['create', 'read', 'update', 'delete'],
  // update/delete are author-scoped in server/api/reviews/[id].{patch,delete}.ts
  review: ['create', 'read', 'update', 'delete'],
  interview: ['create', 'read', 'update'],
  emailTemplate: ['create', 'read', 'update'],
  activityLog: ['read'],
  scoring: ['create', 'read'],
  sourceTracking: ['read'],
})

// guest — external reviewer. Clears the RBAC gate for read + review only; the
// job-scope layer (jobAccess.ts) then confines them to their individually
// assigned jobs. No program access, no create/update/delete on jobs or
// applications, no settings/members/activity-log. review + comment update/delete
// are author-scoped in the route handlers.
export const guest = ac.newRole({
  ...memberAc.statements,
  organization: ['read'],
  job: ['read'],
  // Deliberately NO candidate read: that endpoint isn't job-scoped, so it would
  // let a guest enumerate the whole org. Guests see candidate details inline via
  // the job-scoped application endpoints instead.
  application: ['read'],
  // document read is allowed, but the download/preview routes additionally
  // enforce candidate scope (assertCandidateInScope) so guests can only open
  // documents for applicants in their assigned jobs.
  document: ['read'],
  comment: ['create', 'read', 'update', 'delete'],
  review: ['create', 'read', 'update', 'delete'],
  interview: ['read'],
})
