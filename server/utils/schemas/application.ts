import { z } from 'zod'

export { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

// ─────────────────────────────────────────────
// Application validation schemas — shared across API routes
// ─────────────────────────────────────────────

/** Schema for creating a new application (recruiter links candidate → job) */
export const createApplicationSchema = z.object({
  candidateId: z.string().min(1, 'Candidate is required'),
  jobId: z.string().min(1, 'Job is required'),
  notes: z.string().max(5000).optional(),
})

/** Schema for updating an existing application (status transitions, notes, score) */
export const updateApplicationSchema = z.object({
  status: z.enum(['new', 'screening', 'interview', 'waitlist', 'offer', 'hired', 'rejected']).optional(),
  notes: z.string().max(5000).nullish(),
  score: z.number().int().min(0).max(100).nullish(),
})

/** Allowed values for a manual onboarding-step verification. */
export const applicationStepStatusValues = ['pending', 'submitted', 'verified'] as const

/**
 * Schema for staff manually setting the fee / signed-documents verification
 * state on an application. At least one field must be present.
 */
export const updateVerificationsSchema = z.object({
  feeStatus: z.enum(applicationStepStatusValues).optional(),
  documentsStatus: z.enum(applicationStepStatusValues).optional(),
}).refine(
  (data) => data.feeStatus !== undefined || data.documentsStatus !== undefined,
  { message: 'Provide feeStatus and/or documentsStatus' },
)

/** Schema for application list query params */
export const applicationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  jobId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  status: z.enum(['new', 'screening', 'interview', 'waitlist', 'offer', 'hired', 'rejected']).optional(),
  search: z.string().trim().max(200).optional(),
  score: z.enum(['high', 'medium', 'low', 'none']).optional(),
  interview: z.enum(['has-interview', 'no-interview']).optional(),
  sort: z.enum(['date-desc', 'date-asc', 'name-asc', 'name-desc', 'score-desc', 'score-asc', 'updated-desc']).default('date-desc'),
  /** JSON-encoded array of { propertyDefinitionId, op, value } filters */
  propertyFilters: z.string().optional(),
})

/** Reusable schema for `:id` route params */
export const applicationIdParamSchema = z.object({
  id: z.string().min(1),
})

/**
 * Schema for sending a custom email to a hand-picked set of applications.
 * Subject/body may contain {{candidateName}}, {{candidateFirstName}},
 * {{jobTitle}}, {{organizationName}} placeholders, rendered per-recipient.
 */
export const bulkEmailSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1, 'Select at least one applicant').max(500, 'Select at most 500 applicants'),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Message body is required').max(20000),
})

/** Schema for exporting a hand-picked set of applications as one PDF. */
export const bulkExportSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1, 'Select at least one applicant').max(200, 'Select at most 200 applicants'),
})

// Status transition rules are now in shared/status-transitions.ts
// and re-exported above for backward compatibility.
