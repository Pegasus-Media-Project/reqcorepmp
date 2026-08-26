import { z } from 'zod'

// ─────────────────────────────────────────────
// Email template validation schemas
// ─────────────────────────────────────────────

/**
 * Lifecycle events a template can be written for. Mirrors the
 * `emailTemplateTypeEnum` in the DB schema.
 */
export const EMAIL_TEMPLATE_TYPES = [
  'interview_invitation',
  'application_accepted',
  'application_rejected',
  'fee_verified',
  'fee_waived',
  'documents_verified',
  'self_schedule_invitation',
] as const
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number]

/** Allowed placeholder variables for interview invitation templates */
export const TEMPLATE_VARIABLES = [
  'candidateName',
  'candidateFirstName',
  'candidateLastName',
  'candidateEmail',
  'jobTitle',
  'interviewTitle',
  'interviewDate',
  'interviewTime',
  'interviewDuration',
  'interviewType',
  'interviewLocation',
  'interviewers',
  'organizationName',
] as const

/** Variables shared by every application-lifecycle template. */
const COMMON_LIFECYCLE_VARIABLES = [
  'candidateName',
  'candidateFirstName',
  'candidateLastName',
  'jobTitle',
  'organizationName',
  'statusUrl',
] as const

/**
 * The placeholder variables available per template type. Lifecycle events that
 * carry an action link (pay, sign) also expose `actionUrl`.
 */
export const TEMPLATE_VARIABLES_BY_TYPE: Record<EmailTemplateType, readonly string[]> = {
  interview_invitation: TEMPLATE_VARIABLES,
  application_accepted: [...COMMON_LIFECYCLE_VARIABLES, 'actionUrl'],
  application_rejected: COMMON_LIFECYCLE_VARIABLES,
  fee_verified: COMMON_LIFECYCLE_VARIABLES,
  fee_waived: COMMON_LIFECYCLE_VARIABLES,
  documents_verified: COMMON_LIFECYCLE_VARIABLES,
  self_schedule_invitation: [
    'candidateName',
    'candidateFirstName',
    'candidateLastName',
    'jobTitle',
    'organizationName',
    'bookingUrl',
    'expiresAt',
  ],
}

const MAX_SUBJECT_LENGTH = 200
const MAX_BODY_LENGTH = 10_000
const MAX_NAME_LENGTH = 100

/** Schema for creating a new email template */
export const createEmailTemplateSchema = z.object({
  templateType: z.enum(EMAIL_TEMPLATE_TYPES).optional().default('interview_invitation'),
  name: z.string().min(1, 'Template name is required').max(MAX_NAME_LENGTH),
  subject: z.string().min(1, 'Subject line is required').max(MAX_SUBJECT_LENGTH),
  body: z.string().min(1, 'Email body is required').max(MAX_BODY_LENGTH),
})

/** Schema for updating an email template */
export const updateEmailTemplateSchema = z.object({
  templateType: z.enum(EMAIL_TEMPLATE_TYPES).optional(),
  name: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH).optional(),
  body: z.string().min(1).max(MAX_BODY_LENGTH).optional(),
})

/** Schema for the template list query (optional type filter) */
export const emailTemplateQuerySchema = z.object({
  type: z.enum(EMAIL_TEMPLATE_TYPES).optional(),
})

/** Schema for :id route params */
export const emailTemplateIdParamSchema = z.object({
  id: z.string().min(1),
})

/** Schema for sending an interview invitation */
export const sendInterviewInvitationSchema = z.object({
  templateId: z.string().min(1).optional(),
  customSubject: z.string().min(1).max(MAX_SUBJECT_LENGTH).optional(),
  customBody: z.string().min(1).max(MAX_BODY_LENGTH).optional(),
}).refine(
  data => data.templateId || (data.customSubject && data.customBody),
  { message: 'Either a template ID or both custom subject and body are required' },
)

/**
 * Schema for sending a test render of a template to the calling staff member.
 * Provide a template id (system 'system-*' id or custom row id) — the template
 * is rendered with sample data and emailed to the caller's own address.
 */
export const testEmailTemplateSchema = z.object({
  templateId: z.string().min(1).max(100).optional(),
  templateType: z.enum(EMAIL_TEMPLATE_TYPES).optional(),
}).refine(d => d.templateId || d.templateType, {
  message: 'Provide a template id or a template type',
})

// ─────────────────────────────────────────────
// Pre-made (system) templates — single source of truth in shared/
// ─────────────────────────────────────────────

export { SYSTEM_TEMPLATES } from '~~/shared/system-templates'
export type { SystemTemplate } from '~~/shared/system-templates'
