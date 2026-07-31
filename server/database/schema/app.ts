import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  numeric,
  check,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { organization, user } from './auth'

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export const jobStatusEnum = pgEnum('job_status', ['draft', 'open', 'closed', 'archived'])
export const jobTypeEnum = pgEnum('job_type', ['full_time', 'part_time', 'contract', 'internship'])
export const applicationStatusEnum = pgEnum('application_status', [
  'new', 'screening', 'interview', 'waitlist', 'offer', 'hired', 'rejected',
])
export const documentTypeEnum = pgEnum('document_type', ['resume', 'cover_letter', 'other'])
/**
 * Verification state for a per-application onboarding step (application fee,
 * signed documents). `submitted` is reserved for applicant self-report / a
 * future DocuSign webhook; v1 goes straight from `pending` to a staff-set
 * `verified`. `waived` settles the step without it having been met — used to
 * excuse an individual applicant from the fee.
 */
export const applicationStepStatusEnum = pgEnum('application_step_status', ['pending', 'submitted', 'verified', 'waived'])
export const questionTypeEnum = pgEnum('question_type', [
  'short_text', 'long_text', 'single_select', 'multi_select',
  'number', 'date', 'url', 'checkbox', 'file_upload',
  // Display-only informational content block (rich HTML), not an input.
  'info',
  // Matrix of rows (`options`) rated on a 1..n scale (see jobQuestion.config).
  'rating',
])
export const propertyEntityTypeEnum = pgEnum('property_entity_type', ['candidate', 'application'])
export const propertyTypeEnum = pgEnum('property_type', [
  'text', 'long_text', 'number', 'select', 'multi_select',
  'date', 'checkbox', 'url', 'email', 'person', 'file',
])
export const genderEnum = pgEnum('gender', ['male', 'female', 'other', 'prefer_not_to_say'])
export const experienceLevelEnum = pgEnum('experience_level', ['junior', 'mid', 'senior', 'lead'])
export const nameDisplayFormatEnum = pgEnum('name_display_format', ['first_last', 'last_first'])
export const dateFormatEnum = pgEnum('date_format', ['mdy', 'dmy', 'ymd'])

// ─────────────────────────────────────────────
// ATS Domain Tables — ALL scoped by organizationId
// ─────────────────────────────────────────────

/**
 * Post-signup onboarding survey answers for an account.
 *
 * One row per user. Answers are nullable because each question is skippable.
 * `organizationId` captures the active organization created during onboarding,
 * while `userId` is the durable account link for user-level analysis.
 */
export const onboardingSurveyResponse = pgTable('onboarding_survey_response', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  signupPlan: text('signup_plan'),
  signupBilling: text('signup_billing'),
  companySize: text('company_size'),
  userRole: text('user_role'),
  discoverySource: text('discovery_source'),
  currentHiringProcess: text('current_hiring_process'),
  expectedRoles12m: text('expected_roles_12m'),
  answeredCount: integer('answered_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  completedAt: timestamp('completed_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('onboarding_survey_response_user_id_idx').on(t.userId),
  index('onboarding_survey_response_organization_id_idx').on(t.organizationId),
]))

/**
 * Programs (e.g. Pegasus cohorts) within an organization.
 *
 * A job posting may be tied to a program or stand alone (traditional posting).
 * Programs are also the primary axis for scoped management access: a user
 * assigned to a program manages every job inside it (see `programAssignment`).
 */
export const program = pgTable('program', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('program_organization_id_idx').on(t.organizationId),
]))

/**
 * Jobs / Positions within an organization.
 */
export const job = pgTable('job', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Optional program this posting belongs to. Null = traditional job posting. */
  programId: text('program_id').references(() => program.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  location: text('location'),
  /**
   * Employment type as a free-text label (e.g. "Full-time", "Freelance").
   * The set of selectable labels is org-configurable via the `employmentType`
   * table; this column stores the chosen label directly rather than a fixed enum.
   */
  type: text('type').notNull().default('Full-time'),
  status: jobStatusEnum('status').notNull().default('draft'),
  // ── SEO / Rich Results fields ──
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency'),
  salaryUnit: text('salary_unit'),
  salaryNegotiable: boolean('salary_negotiable').notNull().default(false),
  remoteStatus: text('remote_status'),
  validThrough: timestamp('valid_through'),
  /** Experience level required for this role */
  experienceLevel: experienceLevelEnum('experience_level'),
  // ── Application form settings ──
  phoneRequirement: text('phone_requirement').$type<'hidden' | 'optional' | 'required'>().notNull().default('optional'),
  requireResume: boolean('require_resume').notNull().default(false),
  requireCoverLetter: boolean('require_cover_letter').notNull().default(false),
  // ── Application questions display ──
  /** Hide the on-page questions list on the public job listing. */
  hideApplicationQuestions: boolean('hide_application_questions').notNull().default(false),
  /** Optional external PDF link listing all application questions. */
  applicationQuestionsPdfUrl: text('application_questions_pdf_url'),
  // ── Application fee (submission phase; staff manually verify payment) ──
  applicationFeeEnabled: boolean('application_fee_enabled').notNull().default(false),
  /** External payment link the applicant is sent to. */
  applicationFeeUrl: text('application_fee_url'),
  /** Fee amount in minor units (e.g. cents); displayed formatted. */
  applicationFeeAmount: integer('application_fee_amount'),
  /** ISO 4217 currency code, e.g. 'USD'. */
  applicationFeeCurrency: text('application_fee_currency'),
  // ── Signed documents (acceptance phase; staff manually verify signing) ──
  requireSignedDocuments: boolean('require_signed_documents').notNull().default(false),
  /** External signing / DocuSign link (scaffold; embed comes later). */
  signingUrl: text('signing_url'),
  // ── AI scoring settings ──
  autoScoreOnApply: boolean('auto_score_on_apply').notNull().default(false),
  /**
   * Which optional candidate data sources the AI analysis reads. A resume is
   * always included when present, but another enabled source is sufficient.
   */
  analysisContext: jsonb('analysis_context').$type<{
    coverLetter: boolean
    screeningAnswers: boolean
    recruiterNotes: boolean
  }>().notNull().default({ coverLetter: true, screeningAnswers: true, recruiterNotes: false }),
  // ── Timestamps ──
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('job_organization_id_idx').on(t.organizationId),
  index('job_program_id_idx').on(t.programId),
]))

/**
 * Scoped management access — assigns a user to a whole program.
 * The user gains full management of every job in that program.
 */
export const programAssignment = pgTable('program_assignment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  programId: text('program_id').notNull().references(() => program.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('program_assignment_user_program_idx').on(t.userId, t.programId),
  index('program_assignment_organization_id_idx').on(t.organizationId),
  index('program_assignment_program_id_idx').on(t.programId),
]))

/**
 * Scoped management access — assigns a user to a single job.
 * Covers standalone (traditional) postings and one-off exceptions.
 */
export const jobAssignment = pgTable('job_assignment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('job_assignment_user_job_idx').on(t.userId, t.jobId),
  index('job_assignment_organization_id_idx').on(t.organizationId),
  index('job_assignment_job_id_idx').on(t.jobId),
]))

/**
 * Candidates (applicants) belonging to a specific tenant.
 */
export const candidate = pgTable('candidate', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  /** Optional display name override (e.g. for localized name ordering) */
  displayName: text('display_name'),
  email: text('email').notNull(),
  phone: text('phone'),
  /** Gender — stored as enum for structured filtering */
  gender: genderEnum('gender'),
  /** Date of birth — stored as text in ISO 8601 format (YYYY-MM-DD) to avoid timezone issues */
  dateOfBirth: text('date_of_birth'),
  /** Quick notes visible inline on the candidates list */
  quickNotes: text('quick_notes'),
  // ── GDPR retention / erasure lifecycle ──
  /** When set and in the future, this candidate is exempt from automated retention deletion */
  retentionExemptUntil: timestamp('retention_exempt_until'),
  /** Documented justification for the exemption (legal hold, active dispute, etc.) */
  retentionExemptReason: text('retention_exempt_reason'),
  /**
   * When an admin last manually reviewed/restored this candidate. Acts as a
   * fresh retention anchor: restoring from quarantine sets this to now so the
   * candidate gets a full retention window again instead of being re-quarantined
   * on the next sweep. NULL = never manually reviewed.
   */
  retentionReviewedAt: timestamp('retention_reviewed_at'),
  /** When the candidate entered the recoverable quarantine window. NULL = not quarantined. */
  quarantinedAt: timestamp('quarantined_at'),
  /** When a quarantined candidate becomes eligible for permanent erasure */
  scheduledPurgeAt: timestamp('scheduled_purge_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('candidate_organization_id_idx').on(t.organizationId),
  index('candidate_gender_idx').on(t.organizationId, t.gender),
  uniqueIndex('candidate_org_email_idx').on(t.organizationId, t.email),
  // Drives the retention cron's quarantine → purge sweep efficiently.
  index('candidate_quarantine_idx').on(t.organizationId, t.scheduledPurgeAt),
]))

/**
 * An application links a candidate to a job within the same organization.
 */
export const application = pgTable('application', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  candidateId: text('candidate_id').notNull().references(() => candidate.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  status: applicationStatusEnum('status').notNull().default('new'),
  score: integer('score'),
  notes: text('notes'),
  coverLetterText: text('cover_letter_text'),
  // Public, airline-style confirmation code an applicant uses to check status at
  // /status. Unique so a code maps to exactly one application. Nullable because
  // rows created before this feature (and any internal inserts) have none.
  confirmationCode: text('confirmation_code'),
  // ── Onboarding-step verification (only meaningful when the job requires them) ──
  // Application fee (submission phase).
  feeStatus: applicationStepStatusEnum('fee_status').notNull().default('pending'),
  // Who settled the fee step and when — set for both `verified` and `waived`.
  feeVerifiedById: text('fee_verified_by_id').references(() => user.id),
  feeVerifiedAt: timestamp('fee_verified_at'),
  // Signed documents (acceptance phase).
  documentsStatus: applicationStepStatusEnum('documents_status').notNull().default('pending'),
  documentsVerifiedById: text('documents_verified_by_id').references(() => user.id),
  documentsVerifiedAt: timestamp('documents_verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('application_organization_id_idx').on(t.organizationId),
  index('application_candidate_id_idx').on(t.candidateId),
  index('application_job_id_idx').on(t.jobId),
  uniqueIndex('application_org_candidate_job_idx').on(t.organizationId, t.candidateId, t.jobId),
  uniqueIndex('application_confirmation_code_idx').on(t.confirmationCode),
]))

/**
 * Documents stored in MinIO (resumes, cover letters, etc.).
 * `storageKey` is the S3 object key in the bucket.
 * `parsedContent` holds the structured JSON output from PDF parsing.
 */
export const document = pgTable('document', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  candidateId: text('candidate_id').notNull().references(() => candidate.id, { onDelete: 'cascade' }),
  type: documentTypeEnum('type').notNull().default('resume'),
  storageKey: text('storage_key').notNull().unique(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes'),
  parsedContent: jsonb('parsed_content'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('document_organization_id_idx').on(t.organizationId),
  index('document_candidate_id_idx').on(t.candidateId),
]))

// ─────────────────────────────────────────────
// Custom Application Form Questions
// ─────────────────────────────────────────────

/**
 * Custom questions configured by the recruiter for a specific job.
 * These appear on the public application form alongside the standard fields.
 * `options` is only used for `single_select` and `multi_select` types.
 */
/**
 * Sections group a job's custom questions into pages of a multi-step
 * application wizard. A question with a NULL sectionId belongs to the implicit
 * default page (keeps pre-sections jobs working). Sections are ordered by
 * `displayOrder`; questions order within a section by their own displayOrder.
 */
export const jobQuestionSection = pgTable('job_question_section', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('job_question_section_organization_id_idx').on(t.organizationId),
  index('job_question_section_job_id_idx').on(t.jobId),
]))

export const jobQuestion = pgTable('job_question', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  /** Optional wizard section/page. NULL = the implicit default page. */
  sectionId: text('section_id').references(() => jobQuestionSection.id, { onDelete: 'set null' }),
  type: questionTypeEnum('type').notNull().default('short_text'),
  label: text('label').notNull(),
  description: text('description'),
  /** Rich HTML body for `info` content blocks (images embedded as data URLs). */
  content: text('content'),
  required: boolean('required').notNull().default(false),
  options: jsonb('options').$type<string[]>(),
  /**
   * Type-specific settings.
   *
   * `rating` takes its rows from `options` and its scale (`ratingMax`) plus the
   * optional endpoint captions from here. `visibleWhen` is type-agnostic: it
   * branches the question off another question's answer.
   */
  config: jsonb('config').$type<{
    ratingMax?: number
    ratingMinLabel?: string | null
    ratingMaxLabel?: string | null
    visibleWhen?: { questionId: string, values: string[] } | null
  } | null>(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('job_question_organization_id_idx').on(t.organizationId),
  index('job_question_job_id_idx').on(t.jobId),
  index('job_question_section_id_idx').on(t.sectionId),
]))

/**
 * Shareable read-only preview of a job's application form.
 *
 * Lets a recruiter send the form to a colleague before the posting is
 * published: the link resolves whatever the job's status, requires no account,
 * and never accepts a submission. One active (unrevoked, unexpired) link per
 * job — creating a new one revokes the previous.
 */
export const jobPreviewLink = pgTable('job_preview_link', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  /** Lightweight usage signal so the recruiter can tell if anyone opened it. */
  viewCount: integer('view_count').notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('job_preview_link_organization_id_idx').on(t.organizationId),
  index('job_preview_link_job_id_idx').on(t.jobId),
  index('job_preview_link_token_idx').on(t.token),
]))

/**
 * Org-configurable employment types (e.g. "Full-time", "Freelance").
 * Populates the employment-type picker on the job form. `job.type` stores the
 * chosen label directly, so these rows are the editable source of that list.
 */
export const employmentType = pgTable('employment_type', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('employment_type_organization_id_idx').on(t.organizationId),
  uniqueIndex('employment_type_org_label_idx').on(t.organizationId, t.label),
]))

/**
 * Applicant responses to custom questions, stored per application.
 * `value` is stored as JSONB to support different response types
 * (string, string[], number, boolean, or row → rating for `rating` questions).
 */
export const questionResponse = pgTable('question_response', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => jobQuestion.id, { onDelete: 'cascade' }),
  value: jsonb('value').$type<string | string[] | number | boolean | Record<string, number>>().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('question_response_organization_id_idx').on(t.organizationId),
  index('question_response_application_id_idx').on(t.applicationId),
  index('question_response_question_id_idx').on(t.questionId),
]))

// ─────────────────────────────────────────────
// Custom Properties (Notion-style "database properties")
// ─────────────────────────────────────────────
//
// Two-table design:
//   - propertyDefinition: schema. Org-global when jobId IS NULL; per-job otherwise.
//                         entityType=candidate is always org-global (jobId must be NULL).
//                         entityType=application can be org-global OR per-job.
//   - propertyValue:      values, polymorphic to candidate.id or application.id.
//
// `value` is jsonb shaped by the property type:
//   text/long_text/url/email/person → string
//   number                          → number
//   select                          → string (one option id)
//   multi_select                    → string[] (option ids)
//   date                            → string (ISO YYYY-MM-DD)
//   checkbox                        → boolean
//   file                            → { documentId: string }
//
// `config` jsonb:
//   select / multi_select → { options: [{ id, label, color }] }
//   number                → { format?: 'plain' | 'percent' | 'currency', currency?: string }
//   others                → null
//
// Per-job overrides are NOT supported (additive only): per-job props are merged
// after org-global ones, ordered by displayOrder.

export const propertyDefinition = pgTable('property_definition', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** NULL = org-global. Non-null = per-job (only valid when entityType='application'). */
  jobId: text('job_id').references(() => job.id, { onDelete: 'cascade' }),
  entityType: propertyEntityTypeEnum('entity_type').notNull(),
  type: propertyTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  config: jsonb('config').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('property_definition_org_idx').on(t.organizationId),
  index('property_definition_org_entity_idx').on(t.organizationId, t.entityType),
  index('property_definition_job_idx').on(t.jobId),
]))

export const propertyValue = pgTable('property_value', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  propertyDefinitionId: text('property_definition_id').notNull().references(() => propertyDefinition.id, { onDelete: 'cascade' }),
  entityType: propertyEntityTypeEnum('entity_type').notNull(),
  /** candidate.id when entityType='candidate', application.id when 'application' */
  entityId: text('entity_id').notNull(),
  value: jsonb('value'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('property_value_org_idx').on(t.organizationId),
  index('property_value_entity_idx').on(t.entityType, t.entityId),
  index('property_value_definition_idx').on(t.propertyDefinitionId),
  uniqueIndex('property_value_def_entity_idx').on(t.propertyDefinitionId, t.entityId),
]))

// ─────────────────────────────────────────────
// Organization Localization Settings
// ─────────────────────────────────────────────

/**
 * Per-organization localization preferences.
 * Controls how candidate names and dates are displayed across the app.
 * One row per organization — upserted on change.
 */
export const orgSettings = pgTable('org_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Controls whether names display as "First Last" or "Last First" */
  nameDisplayFormat: nameDisplayFormatEnum('name_display_format').notNull().default('first_last'),
  /** Controls the date display format across the app */
  dateFormat: dateFormatEnum('date_format').notNull().default('mdy'),
  // ── GDPR retention policy ──
  /** Master switch — when false, no automated retention deletion runs for this org */
  retentionEnabled: boolean('retention_enabled').notNull().default(false),
  /** Months of inactivity (since latest recruitment process ends) before erasure */
  retentionMonths: integer('retention_months').notNull().default(24),
  /** Days a candidate stays recoverable in quarantine before permanent erasure */
  quarantineDays: integer('quarantine_days').notNull().default(30),
  /** First time retention was enabled — anchors the review window so existing data
   *  is never deleted immediately. NULL until the org first enables retention. */
  retentionActivatedAt: timestamp('retention_activated_at'),
  // ── Application-form privacy notice (org-configurable) ──
  privacyPolicyUrl: text('privacy_policy_url'),
  privacyPolicyText: text('privacy_policy_text'),
  privacyContactEmail: text('privacy_contact_email'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('org_settings_organization_id_idx').on(t.organizationId),
]))

// ─────────────────────────────────────────────
// GDPR Retention Audit
// ─────────────────────────────────────────────

export const retentionAuditActionEnum = pgEnum('retention_audit_action', [
  'quarantined', 'restored', 'erased', 'exempted', 'unexempted', 'exported',
])

/**
 * Privacy-safe audit trail for retention & erasure actions.
 *
 * Deliberately stores NO personal data — no names, emails, filenames, resume
 * content, or storage keys. `candidateId` is an opaque UUID kept as proof that a
 * specific record was handled; it is not personal data once the candidate is gone.
 * Lives in its own table (not `activity_log`) so it survives candidate erasure,
 * which deletes the candidate's `activity_log` rows.
 */
export const retentionAudit = pgTable('retention_audit', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Opaque candidate UUID — intentionally NOT a foreign key so it outlives erasure. */
  candidateId: text('candidate_id').notNull(),
  action: retentionAuditActionEnum('action').notNull(),
  /** Outcome marker: 'success' | 'partial' | 'failed' | 'dry_run'. */
  result: text('result').notNull().default('success'),
  /** Triggering user id, or null for scheduled cron runs. Opaque id, not PII. */
  actorId: text('actor_id'),
  /** Non-PII counts only (e.g. { documents: 2, comments: 1, s3Failures: 0 }). */
  metadata: jsonb('metadata').$type<Record<string, number | string>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('retention_audit_organization_id_idx').on(t.organizationId),
  index('retention_audit_candidate_id_idx').on(t.candidateId),
  index('retention_audit_created_at_idx').on(t.createdAt),
]))

// ─────────────────────────────────────────────
// Invite Links & Join Requests
// ─────────────────────────────────────────────

export const joinRequestStatusEnum = pgEnum('join_request_status', ['pending', 'approved', 'rejected'])

/**
 * Shareable invite links generated by org owners/admins.
 * Anyone with the link (and authenticated) can join at the specified role.
 * `token` is a cryptographic random hex string — NOT the primary key —
 * to prevent ID enumeration.
 */
export const inviteLink = pgTable('invite_link', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  role: text('role').notNull().default('member'),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('invite_link_organization_id_idx').on(t.organizationId),
  index('invite_link_token_idx').on(t.token),
]))

/**
 * Join requests submitted by authenticated users wanting to join an org.
 * Only one pending request per user per org at a time (enforced in API).
 */
export const joinRequest = pgTable('join_request', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  message: text('message'),
  status: joinRequestStatusEnum('status').notNull().default('pending'),
  reviewedById: text('reviewed_by_id').references(() => user.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('join_request_organization_id_idx').on(t.organizationId),
  index('join_request_user_id_idx').on(t.userId),
  index('join_request_status_idx').on(t.status),
]))

export const reviewerInviteStatusEnum = pgEnum('reviewer_invite_status', ['pending', 'accepted', 'revoked'])

/**
 * Links a Better Auth org invitation (role=guest) to the specific job(s) the
 * invited guest reviewer should be scoped to. Better Auth's `invitation` table
 * has a fixed schema, so we carry the job binding here. On accept, a matching
 * `jobAssignment` is created for each row, confining the guest to those jobs.
 * One row per (invitation, job).
 */
export const reviewerInvite = pgTable('reviewer_invite', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Lower-cased invitee email — used to bind job assignments on accept. */
  email: text('email').notNull(),
  /** Better Auth invitation id this binding belongs to. */
  invitationId: text('invitation_id').notNull(),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  invitedById: text('invited_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  status: reviewerInviteStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('reviewer_invite_invitation_job_idx').on(t.invitationId, t.jobId),
  index('reviewer_invite_organization_id_idx').on(t.organizationId),
  index('reviewer_invite_email_idx').on(t.email),
  index('reviewer_invite_job_id_idx').on(t.jobId),
]))

// ─────────────────────────────────────────────
// Collaboration: Comments
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Calendar Integrations
// ─────────────────────────────────────────────

export const calendarProviderEnum = pgEnum('calendar_provider', ['google'])

/**
 * Per-user calendar integration credentials.
 * Tokens are encrypted at rest with AES-256-GCM derived from BETTER_AUTH_SECRET.
 * Each user can connect one calendar provider. The `calendarId` is the target
 * calendar for interview events (defaults to 'primary').
 */
export const calendarIntegration = pgTable('calendar_integration', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  provider: calendarProviderEnum('provider').notNull().default('google'),
  /** AES-256-GCM encrypted Google OAuth2 access token */
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  /** AES-256-GCM encrypted Google OAuth2 refresh token */
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  /** Google Calendar ID to create events in (defaults to 'primary') */
  calendarId: text('calendar_id').notNull().default('primary'),
  /** Email address of the connected Google account */
  accountEmail: text('account_email'),
  /** Google push notification channel ID for two-way sync */
  webhookChannelId: text('webhook_channel_id'),
  /** Google push notification resource ID (needed for stop) */
  webhookResourceId: text('webhook_resource_id'),
  /** When the webhook channel expires (Google max = 7 days) */
  webhookExpiration: timestamp('webhook_expiration'),
  /** Incremental sync token from Google Calendar API */
  syncToken: text('sync_token'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('calendar_integration_user_provider_idx').on(t.userId, t.provider),
  index('calendar_integration_webhook_channel_idx').on(t.webhookChannelId),
]))

// ─────────────────────────────────────────────
// Interviews
// ─────────────────────────────────────────────

export const interviewTypeEnum = pgEnum('interview_type', [
  'phone', 'video', 'in_person', 'panel', 'technical', 'take_home',
])

export const interviewStatusEnum = pgEnum('interview_status', [
  'scheduled', 'completed', 'cancelled', 'no_show',
])

export const candidateResponseEnum = pgEnum('candidate_response', [
  'pending', 'accepted', 'declined', 'tentative',
])

/**
 * Interviews scheduled for applications in the pipeline.
 * Each interview is linked to an application (which contains candidate + job).
 * Multiple interviews can exist per application (e.g., phone screen → technical → panel).
 */
export const interview = pgTable('interview', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: interviewTypeEnum('type').notNull().default('video'),
  status: interviewStatusEnum('status').notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  duration: integer('duration').notNull().default(60),
  location: text('location'),
  notes: text('notes'),
  interviewers: jsonb('interviewers').$type<string[]>(),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  invitationSentAt: timestamp('invitation_sent_at'),
  candidateResponse: candidateResponseEnum('candidate_response').notNull().default('pending'),
  candidateRespondedAt: timestamp('candidate_responded_at'),
  /** Google Calendar event ID for two-way sync (null = not synced) */
  googleCalendarEventId: text('google_calendar_event_id'),
  /** Direct link to the Google Calendar event (htmlLink from Google API) */
  googleCalendarEventLink: text('google_calendar_event_link'),
  /** IANA timezone for the scheduled time (e.g. 'America/New_York') */
  timezone: text('timezone').notNull().default('UTC'),
  /**
   * iCalendar SEQUENCE for this interview's event — incremented on every
   * reschedule so calendar clients treat the new .ics as an update to the
   * original invite (same UID), not a second event.
   */
  icsSequence: integer('ics_sequence').notNull().default(0),
  /**
   * When this interview was created by a candidate booking a shared open slot,
   * this references that slot. Null for recruiter-scheduled fixed-time interviews.
   */
  // NOTE: deliberately a plain column, not a Drizzle `.references()`. The FK is
  // enforced by a hand-written statement in migration 0050 that the snapshot
  // does not track; declaring it here as well would make the next `db:generate`
  // emit a duplicate ADD CONSTRAINT.
  slotId: text('slot_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('interview_organization_id_idx').on(t.organizationId),
  index('interview_application_id_idx').on(t.applicationId),
  index('interview_scheduled_at_idx').on(t.scheduledAt),
  index('interview_status_idx').on(t.status),
  index('interview_created_by_id_idx').on(t.createdById),
  index('interview_slot_id_idx').on(t.slotId),
]))

/**
 * Reviewers (org members or guests) assigned to an interview.
 * Structured link on top of the free-text `interview.interviewers` email array:
 * lets us bulk-assign known users, send each a calendar invite, and track
 * invite status. A user assigned here is also added to `interview.interviewers`
 * (and the Google Calendar event) so they receive the invite.
 */
export const interviewReviewer = pgTable('interview_reviewer', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  interviewId: text('interview_id').notNull().references(() => interview.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  /** When the calendar invite was sent to this reviewer (null = not yet). */
  invitedAt: timestamp('invited_at'),
  /** True once added as an attendee on the interview's Google Calendar event. */
  calendarSynced: boolean('calendar_synced').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('interview_reviewer_interview_user_idx').on(t.interviewId, t.userId),
  index('interview_reviewer_organization_id_idx').on(t.organizationId),
  index('interview_reviewer_interview_id_idx').on(t.interviewId),
]))

// ─────────────────────────────────────────────
// Interview Slots (candidate self-scheduling)
// ─────────────────────────────────────────────

/** open = taking bookings, closed = no new bookings, cancelled = withdrawn. */
export const interviewSlotStatusEnum = pgEnum('interview_slot_status', [
  'open', 'closed', 'cancelled',
])

export const slotBookingStatusEnum = pgEnum('slot_booking_status', [
  'confirmed', 'cancelled',
])

/**
 * A shared, capacity-bounded, bookable interview time slot for a job.
 * Recruiters define a pool of these; invited candidates book one first-come.
 * A booking materializes a normal `interview` row (see interviewSlotBooking).
 */
export const interviewSlot = pgTable('interview_slot', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: interviewTypeEnum('type').notNull().default('video'),
  startsAt: timestamp('starts_at').notNull(),
  duration: integer('duration').notNull().default(60),
  timezone: text('timezone').notNull().default('UTC'),
  location: text('location'),
  interviewers: jsonb('interviewers').$type<string[]>(),
  notes: text('notes'),
  /** Maximum number of candidates that can book this slot. */
  capacity: integer('capacity').notNull().default(1),
  /** Current number of confirmed bookings — the race-safe availability counter. */
  bookedCount: integer('booked_count').notNull().default(0),
  status: interviewSlotStatusEnum('status').notNull().default('open'),
  /**
   * True when this slot was produced by the job's availability settings
   * (jobInterviewAvailability). Regenerating availability replaces future
   * unbooked generated slots but never touches manual ones.
   */
  generated: boolean('generated').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  check('interview_slot_capacity_check', sql`${t.bookedCount} <= ${t.capacity}`),
  index('interview_slot_organization_id_idx').on(t.organizationId),
  index('interview_slot_job_id_idx').on(t.jobId),
  index('interview_slot_starts_at_idx').on(t.startsAt),
  index('interview_slot_status_idx').on(t.status),
]))

/**
 * Job-level interview availability: the interview length and the recurring
 * time windows in which candidates may self-schedule. Saving this generates
 * the concrete `interviewSlot` rows candidates book against (marked
 * `generated: true`); the slot pool remains the single booking substrate.
 * One row per job.
 */
export const jobInterviewAvailability = pgTable('job_interview_availability', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  /** Title copied onto generated slots (and thus onto booked interviews). */
  title: text('title').notNull().default('Interview'),
  type: interviewTypeEnum('type').notNull().default('video'),
  /** Interview length in minutes; also the step between generated start times. */
  duration: integer('duration').notNull().default(60),
  /** IANA timezone the windows are expressed in. */
  timezone: text('timezone').notNull().default('UTC'),
  location: text('location'),
  /** Candidates per generated slot. */
  capacity: integer('capacity').notNull().default(1),
  /** First and last calendar day (inclusive, in `timezone`) to offer times. */
  dateFrom: text('date_from').notNull(),
  dateTo: text('date_to').notNull(),
  /** Days of week offered: 0 = Sunday … 6 = Saturday (legacy weekday mode). */
  daysOfWeek: jsonb('days_of_week').$type<number[]>().notNull(),
  /**
   * Explicit dates to offer, each optionally overriding the daily window.
   * When present this supersedes daysOfWeek: only these dates get slots.
   */
  dates: jsonb('dates').$type<Array<{ date: string, windowStart?: string, windowEnd?: string }>>(),
  /** Daily window in `timezone`, 24h "HH:MM" strings. */
  windowStart: text('window_start').notNull(),
  windowEnd: text('window_end').notNull(),
  /** Optional daily break (e.g. lunch) during which nothing can be booked. */
  breakStart: text('break_start'),
  breakEnd: text('break_end'),
  /** Gap in minutes between consecutive interviews (0 = back-to-back). */
  buffer: integer('buffer').notNull().default(0),
  /**
   * Email template for the self-schedule invitation: a system template id
   * (e.g. 'system-self-schedule') or a custom emailTemplate row id.
   * Null = the built-in default.
   */
  invitationTemplateId: text('invitation_template_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('job_interview_availability_job_id_idx').on(t.jobId),
  index('job_interview_availability_organization_id_idx').on(t.organizationId),
]))

/**
 * A candidate's booking of an interview slot. Carries the uniqueness constraint
 * that prevents one application from holding more than one active booking, and
 * links to the materialized `interview` row.
 */
export const interviewSlotBooking = pgTable('interview_slot_booking', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  slotId: text('slot_id').notNull().references(() => interviewSlot.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  interviewId: text('interview_id').references(() => interview.id, { onDelete: 'set null' }),
  status: slotBookingStatusEnum('status').notNull().default('confirmed'),
  bookedAt: timestamp('booked_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  // One active (confirmed) booking per application, enforced at the DB level.
  uniqueIndex('slot_booking_app_active_idx').on(t.applicationId).where(sql`status = 'confirmed'`),
  // Exact-duplicate backstop: a given application books a given slot at most once.
  uniqueIndex('slot_booking_slot_app_idx').on(t.slotId, t.applicationId),
  index('slot_booking_organization_id_idx').on(t.organizationId),
  index('slot_booking_slot_id_idx').on(t.slotId),
  index('slot_booking_application_id_idx').on(t.applicationId),
]))

// ─────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────

/**
 * The lifecycle event a template is written for. `interview_invitation` is the
 * original (manually chosen at interview-send time); the rest fire automatically
 * on the corresponding application event.
 */
export const emailTemplateTypeEnum = pgEnum('email_template_type', [
  'interview_invitation',
  'application_accepted',
  'application_rejected',
  'fee_verified',
  'fee_waived',
  'documents_verified',
  'self_schedule_invitation',
])

/**
 * Reusable, org-customizable email templates keyed by lifecycle event
 * (`templateType`). Each org can create a custom template per event or fall back
 * to the built-in system defaults. Body/subject support placeholder variables
 * like {{candidateName}}, {{jobTitle}}, etc.
 */
export const emailTemplate = pgTable('email_template', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Which lifecycle event this template is used for. */
  templateType: emailTemplateTypeEnum('template_type').notNull().default('interview_invitation'),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('email_template_organization_id_idx').on(t.organizationId),
  index('email_template_created_by_id_idx').on(t.createdById),
  index('email_template_org_type_idx').on(t.organizationId, t.templateType),
]))

export const commentTargetEnum = pgEnum('comment_target', ['candidate', 'application', 'job'])

/**
 * Internal comments left by team members on candidates, applications, or jobs.
 * Scoped by organizationId for tenant isolation.
 */
export const comment = pgTable('comment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  targetType: commentTargetEnum('target_type').notNull(),
  targetId: text('target_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('comment_organization_id_idx').on(t.organizationId),
  index('comment_target_idx').on(t.targetType, t.targetId),
  index('comment_author_id_idx').on(t.authorId),
]))

// ─────────────────────────────────────────────
// Collaboration: Reviewer Ratings
// ─────────────────────────────────────────────

/**
 * Stage at which a human reviewer scores an applicant. Kept independent of the
 * pipeline `applicationStatusEnum` so a reviewer can score the screening and
 * interview stages separately regardless of the applicant's current status.
 */
export const reviewStageEnum = pgEnum('review_stage', ['screening', 'interview'])

/**
 * A single reviewer's rating + notes for one applicant at one stage.
 * One row per (application, reviewer, stage) — editable via upsert. Ratings are
 * per-reviewer; per-stage averages are computed on read, never stored as a
 * single shared value. `jobId` is denormalized for cheap job-level aggregation
 * and scope filtering.
 */
export const review = pgTable('review', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  reviewerId: text('reviewer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  stage: reviewStageEnum('stage').notNull(),
  /** 1–5 stars. Nullable so a reviewer can leave notes without a score. */
  rating: integer('rating'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('review_organization_id_idx').on(t.organizationId),
  index('review_application_id_idx').on(t.applicationId),
  index('review_job_id_idx').on(t.jobId),
  uniqueIndex('review_org_application_reviewer_stage_idx').on(t.organizationId, t.applicationId, t.reviewerId, t.stage),
]))

// ─────────────────────────────────────────────
// Collaboration: Activity Log
// ─────────────────────────────────────────────

export const activityActionEnum = pgEnum('activity_action', [
  'created', 'updated', 'deleted', 'status_changed',
  'comment_added', 'member_invited', 'member_removed', 'member_role_changed',
  'scored',
])

// ─────────────────────────────────────────────
// AI Scoring Enums
// ─────────────────────────────────────────────

export const criterionCategoryEnum = pgEnum('criterion_category', [
  'technical', 'experience', 'soft_skills', 'education', 'culture', 'custom',
])

export const analysisRunStatusEnum = pgEnum('analysis_run_status', [
  'completed', 'failed', 'partial',
])

/** Who pays for an analysis run — see analysisRun.billingMode. */
export const analysisBillingModeEnum = pgEnum('analysis_billing_mode', [
  'platform', 'byok',
])

/**
 * Immutable audit trail for all significant actions within an organization.
 * Append-only — no UPDATE or DELETE allowed via the API.
 */
export const activityLog = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  action: activityActionEnum('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('activity_log_organization_id_idx').on(t.organizationId),
  index('activity_log_actor_id_idx').on(t.actorId),
  index('activity_log_resource_idx').on(t.resourceType, t.resourceId),
  index('activity_log_created_at_idx').on(t.createdAt),
]))

// ─────────────────────────────────────────────
// Source Tracking
// ─────────────────────────────────────────────

/**
 * Well-known source identifiers for major job boards and channels.
 * `custom` allows organizations to create their own named sources.
 */
export const sourceChannelEnum = pgEnum('source_channel', [
  'linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'monster',
  'handshake', 'angellist', 'wellfound', 'dice', 'stackoverflow',
  'weworkremotely', 'remoteok', 'builtin', 'hired', 'lever',
  'greenhouse_board', 'google_jobs', 'facebook', 'twitter', 'instagram',
  'tiktok', 'reddit', 'referral', 'career_site', 'email',
  'event', 'agency', 'direct', 'other', 'custom',
])

/**
 * Tracking links generated by recruiters to attribute candidate sources.
 * Each link produces a unique campaign code appended as `?ref=CODE` to the
 * public job page or global careers page. When a candidate applies through
 * a tracked link, the application records the source.
 */
export const trackingLink = pgTable('tracking_link', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Optional — links may be org-wide (null) or scoped to a single job */
  jobId: text('job_id').references(() => job.id, { onDelete: 'cascade' }),
  /** Canonical source channel */
  channel: sourceChannelEnum('channel').notNull().default('custom'),
  /** Human-readable label, e.g. "LinkedIn Spring Campaign" */
  name: text('name').notNull(),
  /** Unique short code used in ?ref=CODE — generated from crypto */
  code: text('code').notNull().unique(),
  /** Standard UTM parameters captured for external analytics */
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmTerm: text('utm_term'),
  utmContent: text('utm_content'),
  /** Aggregate counters (incremented on each click/application) */
  clickCount: integer('click_count').notNull().default(0),
  applicationCount: integer('application_count').notNull().default(0),
  /** Soft-disabled — deactivated links stop incrementing counts */
  isActive: boolean('is_active').notNull().default(true),
  createdById: text('created_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('tracking_link_organization_id_idx').on(t.organizationId),
  index('tracking_link_job_id_idx').on(t.jobId),
  index('tracking_link_code_idx').on(t.code),
  index('tracking_link_channel_idx').on(t.channel),
]))

/**
 * Per-application source attribution — records HOW a candidate discovered
 * and applied to a job. One row per application. Populated at apply time
 * from ?ref=, ?utm_*, or Referer header.
 */
export const applicationSource = pgTable('application_source', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  /** Resolved channel — normalized from tracking link, UTM, or Referer */
  channel: sourceChannelEnum('channel').notNull().default('direct'),
  /** FK to tracking_link if the application came via a tracked link */
  trackingLinkId: text('tracking_link_id').references(() => trackingLink.id, { onDelete: 'set null' }),
  /** Raw UTM query params captured from the application URL */
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmTerm: text('utm_term'),
  utmContent: text('utm_content'),
  /** Cleaned Referer header (domain only — no path/query for privacy) */
  referrerDomain: text('referrer_domain'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('application_source_organization_id_idx').on(t.organizationId),
  index('application_source_application_id_idx').on(t.applicationId),
  index('application_source_channel_idx').on(t.channel),
  index('application_source_tracking_link_id_idx').on(t.trackingLinkId),
  uniqueIndex('application_source_application_idx').on(t.applicationId),
]))

// ─────────────────────────────────────────────
// AI Configuration & Scoring Tables
// ─────────────────────────────────────────────

/**
 * Per-organization AI provider configuration.
 * API keys are encrypted at rest using AES-256-GCM (same as calendar tokens).
 * Each org can configure their own provider, model, and API key.
 */
export const aiConfig = pgTable('ai_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /** Friendly display name shown in the picker (e.g. "GPT-4o (production)"). */
  name: text('name').notNull().default('Default'),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default('gpt-4o-mini'),
  /** AES-256-GCM encrypted API key — NEVER returned to client */
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  /** Optional base URL override (e.g. for Ollama or custom endpoints) */
  baseUrl: text('base_url'),
  maxTokens: integer('max_tokens').notNull().default(4096),
  /** Price per 1M input tokens in USD (e.g. "2.50") */
  inputPricePer1m: numeric('input_price_per_1m', { precision: 10, scale: 4 }),
  /** Price per 1M output tokens in USD (e.g. "10.00") */
  outputPricePer1m: numeric('output_price_per_1m', { precision: 10, scale: 4 }),
  /** When true, this configuration is used by the chatbot when no per-conversation override is set. At most one row per org. */
  isDefaultChatbot: boolean('is_default_chatbot').notNull().default(false),
  /** When true, this configuration is used for applicant analysis (manual + auto). At most one row per org. */
  isDefaultAnalysis: boolean('is_default_analysis').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('ai_config_organization_id_idx').on(t.organizationId),
  // Partial unique indexes enforce at most one default per purpose per org.
  uniqueIndex('ai_config_default_chatbot_idx').on(t.organizationId).where(sql`${t.isDefaultChatbot} = true`),
  uniqueIndex('ai_config_default_analysis_idx').on(t.organizationId).where(sql`${t.isDefaultAnalysis} = true`),
]))

/**
 * Per-organization overrides for the platform-paid OpenRouter fallback.
 * This deliberately does not store an API key: the key remains server-owned,
 * so analysis runs through this config stay `billingMode = platform`.
 */
export const platformAiConfig = pgTable('platform_ai_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Platform (OpenRouter)'),
  provider: text('provider').notNull().default('openrouter'),
  model: text('model').notNull().default('openai/gpt-5.4-mini'),
  maxTokens: integer('max_tokens').notNull().default(4096),
  inputPricePer1m: numeric('input_price_per_1m', { precision: 10, scale: 4 }),
  outputPricePer1m: numeric('output_price_per_1m', { precision: 10, scale: 4 }),
  isDefaultAnalysis: boolean('is_default_analysis').notNull().default(true),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('platform_ai_config_organization_id_idx').on(t.organizationId),
]))

/**
 * Per-job scoring criteria. Each criterion defines one dimension of evaluation.
 * Weights are user-adjustable via sliders and used to compute weighted composite scores.
 */
export const scoringCriterion = pgTable('scoring_criterion', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: criterionCategoryEnum('category').notNull().default('custom'),
  maxScore: integer('max_score').notNull().default(10),
  /** Weight from 0–100, used by sliders. Default 50 = neutral. */
  weight: integer('weight').notNull().default(50),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('scoring_criterion_organization_id_idx').on(t.organizationId),
  index('scoring_criterion_job_id_idx').on(t.jobId),
  uniqueIndex('scoring_criterion_job_key_idx').on(t.jobId, t.key),
]))

/**
 * Individual criterion scores computed by AI for each application.
 * Stores the raw AI output including evidence and confidence.
 */
export const criterionScore = pgTable('criterion_score', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  criterionKey: text('criterion_key').notNull(),
  maxScore: integer('max_score').notNull(),
  applicantScore: integer('applicant_score').notNull(),
  /** Confidence from 0 to 100 (%). */
  confidence: integer('confidence').notNull(),
  evidence: text('evidence').notNull(),
  strengths: jsonb('strengths').$type<string[]>(),
  gaps: jsonb('gaps').$type<string[]>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('criterion_score_organization_id_idx').on(t.organizationId),
  index('criterion_score_application_id_idx').on(t.applicationId),
  uniqueIndex('criterion_score_app_criterion_idx').on(t.applicationId, t.criterionKey),
]))

/**
 * Audit trail for each AI scoring run. Captures the rubric snapshot,
 * model used, token usage, and the raw LLM response for debugging.
 */
export const analysisRun = pgTable('analysis_run', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  status: analysisRunStatusEnum('status').notNull().default('completed'),
  /** Provider + model used for this run */
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  /** Snapshot of criteria at score time for audit trail */
  criteriaSnapshot: jsonb('criteria_snapshot').$type<Record<string, unknown>[]>(),
  /** Composite weighted score (0–100) */
  compositeScore: integer('composite_score'),
  /** Token usage for cost tracking */
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  /**
   * Frozen cost of this run in micro-dollars (1e-6 USD), computed at write time
   * from the central price table (utils/ai/pricing.ts). Null when the model is
   * unpriced. Summed by the budget gate; never recomputed from mutable config.
   */
  costUsdMicros: integer('cost_usd_micros'),
  /**
   * Who pays for this run: `platform` = our OpenRouter key (counts against the
   * org's monthly budget + the global daily kill-switch); `byok` = the org's own
   * API key (never budget-capped — it's their bill, we only track it).
   */
  billingMode: analysisBillingModeEnum('billing_mode').notNull().default('byok'),
  /** Raw LLM response for debugging (sanitized — no PII stored) */
  rawResponse: jsonb('raw_response'),
  errorMessage: text('error_message'),
  scoredById: text('scored_by_id').references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('analysis_run_organization_id_idx').on(t.organizationId),
  index('analysis_run_application_id_idx').on(t.applicationId),
  index('analysis_run_created_at_idx').on(t.createdAt),
]))

// ─────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────

export const onboardingSurveyResponseRelations = relations(onboardingSurveyResponse, ({ one }) => ({
  user: one(user, { fields: [onboardingSurveyResponse.userId], references: [user.id] }),
  organization: one(organization, { fields: [onboardingSurveyResponse.organizationId], references: [organization.id] }),
}))

export const jobRelations = relations(job, ({ one, many }) => ({
  organization: one(organization, { fields: [job.organizationId], references: [organization.id] }),
  program: one(program, { fields: [job.programId], references: [program.id] }),
  applications: many(application),
  questions: many(jobQuestion),
  questionSections: many(jobQuestionSection),
  scoringCriteria: many(scoringCriterion),
  trackingLinks: many(trackingLink),
  assignments: many(jobAssignment),
  previewLinks: many(jobPreviewLink),
}))

export const jobPreviewLinkRelations = relations(jobPreviewLink, ({ one }) => ({
  organization: one(organization, { fields: [jobPreviewLink.organizationId], references: [organization.id] }),
  job: one(job, { fields: [jobPreviewLink.jobId], references: [job.id] }),
  createdBy: one(user, { fields: [jobPreviewLink.createdById], references: [user.id] }),
}))

export const programRelations = relations(program, ({ one, many }) => ({
  organization: one(organization, { fields: [program.organizationId], references: [organization.id] }),
  jobs: many(job),
  assignments: many(programAssignment),
}))

export const programAssignmentRelations = relations(programAssignment, ({ one }) => ({
  organization: one(organization, { fields: [programAssignment.organizationId], references: [organization.id] }),
  program: one(program, { fields: [programAssignment.programId], references: [program.id] }),
  user: one(user, { fields: [programAssignment.userId], references: [user.id] }),
}))

export const jobAssignmentRelations = relations(jobAssignment, ({ one }) => ({
  organization: one(organization, { fields: [jobAssignment.organizationId], references: [organization.id] }),
  job: one(job, { fields: [jobAssignment.jobId], references: [job.id] }),
  user: one(user, { fields: [jobAssignment.userId], references: [user.id] }),
}))

export const candidateRelations = relations(candidate, ({ one, many }) => ({
  organization: one(organization, { fields: [candidate.organizationId], references: [organization.id] }),
  applications: many(application),
  documents: many(document),
}))

export const applicationRelations = relations(application, ({ one, many }) => ({
  organization: one(organization, { fields: [application.organizationId], references: [organization.id] }),
  candidate: one(candidate, { fields: [application.candidateId], references: [candidate.id] }),
  job: one(job, { fields: [application.jobId], references: [job.id] }),
  responses: many(questionResponse),
  interviews: many(interview),
  criterionScores: many(criterionScore),
  analysisRuns: many(analysisRun),
  source: one(applicationSource),
}))

export const documentRelations = relations(document, ({ one }) => ({
  organization: one(organization, { fields: [document.organizationId], references: [organization.id] }),
  candidate: one(candidate, { fields: [document.candidateId], references: [candidate.id] }),
}))

export const jobQuestionRelations = relations(jobQuestion, ({ one }) => ({
  organization: one(organization, { fields: [jobQuestion.organizationId], references: [organization.id] }),
  job: one(job, { fields: [jobQuestion.jobId], references: [job.id] }),
  section: one(jobQuestionSection, { fields: [jobQuestion.sectionId], references: [jobQuestionSection.id] }),
}))

export const jobQuestionSectionRelations = relations(jobQuestionSection, ({ one, many }) => ({
  organization: one(organization, { fields: [jobQuestionSection.organizationId], references: [organization.id] }),
  job: one(job, { fields: [jobQuestionSection.jobId], references: [job.id] }),
  questions: many(jobQuestion),
}))

export const employmentTypeRelations = relations(employmentType, ({ one }) => ({
  organization: one(organization, { fields: [employmentType.organizationId], references: [organization.id] }),
}))

export const questionResponseRelations = relations(questionResponse, ({ one }) => ({
  organization: one(organization, { fields: [questionResponse.organizationId], references: [organization.id] }),
  application: one(application, { fields: [questionResponse.applicationId], references: [application.id] }),
  question: one(jobQuestion, { fields: [questionResponse.questionId], references: [jobQuestion.id] }),
}))

export const propertyDefinitionRelations = relations(propertyDefinition, ({ one, many }) => ({
  organization: one(organization, { fields: [propertyDefinition.organizationId], references: [organization.id] }),
  job: one(job, { fields: [propertyDefinition.jobId], references: [job.id] }),
  values: many(propertyValue),
}))

export const propertyValueRelations = relations(propertyValue, ({ one }) => ({
  organization: one(organization, { fields: [propertyValue.organizationId], references: [organization.id] }),
  definition: one(propertyDefinition, { fields: [propertyValue.propertyDefinitionId], references: [propertyDefinition.id] }),
}))

export const commentRelations = relations(comment, ({ one }) => ({
  organization: one(organization, { fields: [comment.organizationId], references: [organization.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}))

export const reviewRelations = relations(review, ({ one }) => ({
  organization: one(organization, { fields: [review.organizationId], references: [organization.id] }),
  application: one(application, { fields: [review.applicationId], references: [application.id] }),
  job: one(job, { fields: [review.jobId], references: [job.id] }),
  reviewer: one(user, { fields: [review.reviewerId], references: [user.id] }),
}))

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  organization: one(organization, { fields: [activityLog.organizationId], references: [organization.id] }),
  actor: one(user, { fields: [activityLog.actorId], references: [user.id] }),
}))

export const inviteLinkRelations = relations(inviteLink, ({ one }) => ({
  organization: one(organization, { fields: [inviteLink.organizationId], references: [organization.id] }),
  createdBy: one(user, { fields: [inviteLink.createdById], references: [user.id] }),
}))

export const reviewerInviteRelations = relations(reviewerInvite, ({ one }) => ({
  organization: one(organization, { fields: [reviewerInvite.organizationId], references: [organization.id] }),
  job: one(job, { fields: [reviewerInvite.jobId], references: [job.id] }),
  invitedBy: one(user, { fields: [reviewerInvite.invitedById], references: [user.id] }),
}))

export const joinRequestRelations = relations(joinRequest, ({ one }) => ({
  user: one(user, { fields: [joinRequest.userId], references: [user.id] }),
  organization: one(organization, { fields: [joinRequest.organizationId], references: [organization.id] }),
  reviewedBy: one(user, { fields: [joinRequest.reviewedById], references: [user.id] }),
}))

export const interviewRelations = relations(interview, ({ one, many }) => ({
  organization: one(organization, { fields: [interview.organizationId], references: [organization.id] }),
  application: one(application, { fields: [interview.applicationId], references: [application.id] }),
  createdBy: one(user, { fields: [interview.createdById], references: [user.id] }),
  reviewers: many(interviewReviewer),
}))

export const interviewReviewerRelations = relations(interviewReviewer, ({ one }) => ({
  organization: one(organization, { fields: [interviewReviewer.organizationId], references: [organization.id] }),
  interview: one(interview, { fields: [interviewReviewer.interviewId], references: [interview.id] }),
  user: one(user, { fields: [interviewReviewer.userId], references: [user.id] }),
}))

// (no relations() declared for the slot tables — the endpoints use explicit joins)

export const emailTemplateRelations = relations(emailTemplate, ({ one }) => ({
  organization: one(organization, { fields: [emailTemplate.organizationId], references: [organization.id] }),
  createdBy: one(user, { fields: [emailTemplate.createdById], references: [user.id] }),
}))

export const calendarIntegrationRelations = relations(calendarIntegration, ({ one }) => ({
  user: one(user, { fields: [calendarIntegration.userId], references: [user.id] }),
}))

// ─── AI Scoring Relations ──────────────────────────────────────────

export const aiConfigRelations = relations(aiConfig, ({ one }) => ({
  organization: one(organization, { fields: [aiConfig.organizationId], references: [organization.id] }),
}))

export const scoringCriterionRelations = relations(scoringCriterion, ({ one }) => ({
  organization: one(organization, { fields: [scoringCriterion.organizationId], references: [organization.id] }),
  job: one(job, { fields: [scoringCriterion.jobId], references: [job.id] }),
}))

export const criterionScoreRelations = relations(criterionScore, ({ one }) => ({
  organization: one(organization, { fields: [criterionScore.organizationId], references: [organization.id] }),
  application: one(application, { fields: [criterionScore.applicationId], references: [application.id] }),
}))

export const analysisRunRelations = relations(analysisRun, ({ one }) => ({
  organization: one(organization, { fields: [analysisRun.organizationId], references: [organization.id] }),
  application: one(application, { fields: [analysisRun.applicationId], references: [application.id] }),
  scoredBy: one(user, { fields: [analysisRun.scoredById], references: [user.id] }),
}))

// ─── Source Tracking Relations ─────────────────────────────────────

export const trackingLinkRelations = relations(trackingLink, ({ one, many }) => ({
  organization: one(organization, { fields: [trackingLink.organizationId], references: [organization.id] }),
  job: one(job, { fields: [trackingLink.jobId], references: [job.id] }),
  createdBy: one(user, { fields: [trackingLink.createdById], references: [user.id] }),
  applicationSources: many(applicationSource),
}))

export const applicationSourceRelations = relations(applicationSource, ({ one }) => ({
  organization: one(organization, { fields: [applicationSource.organizationId], references: [organization.id] }),
  application: one(application, { fields: [applicationSource.applicationId], references: [application.id] }),
  trackingLink: one(trackingLink, { fields: [applicationSource.trackingLinkId], references: [trackingLink.id] }),
}))

export const orgSettingsRelations = relations(orgSettings, ({ one }) => ({
  organization: one(organization, { fields: [orgSettings.organizationId], references: [organization.id] }),
}))

export const retentionAuditRelations = relations(retentionAudit, ({ one }) => ({
  organization: one(organization, { fields: [retentionAudit.organizationId], references: [organization.id] }),
}))

// ─────────────────────────────────────────────
// Chatbot — per-user persisted state
// ─────────────────────────────────────────────
// Conversations, folders and custom AI agents are PRIVATE to the creating user
// (scoped by both organizationId AND userId). The chatbot itself runs against
// org-wide data via tool calls, but the chat history and user preferences
// (custom system prompts, folder organisation) never leak between users.

export const chatbotMessageRoleEnum = pgEnum('chatbot_message_role', ['user', 'assistant'])

/**
 * Custom AI agents — user-defined personas with their own system prompt.
 * Each user manages their own private list. isDefault marks the one that
 * gets pre-selected when starting a new conversation.
 */
export const chatbotAgent = pgTable('chatbot_agent', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Short description shown next to the name in the picker. */
  description: text('description'),
  /** Lucide icon name (e.g. 'Sparkles'). Optional; UI falls back to a default. */
  icon: text('icon'),
  /** The custom system prompt appended/replacing the base assistant prompt. */
  systemPrompt: text('system_prompt').notNull(),
  /** Default temperature override (0..2). Null → use server default. */
  temperature: numeric('temperature', { precision: 3, scale: 2 }),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('chatbot_agent_org_user_idx').on(t.organizationId, t.userId),
  // Enforce single default agent per (org, user) at the DB layer to backstop
  // the application-level clear-then-set logic against concurrent requests.
  uniqueIndex('chatbot_agent_default_per_user_idx')
    .on(t.organizationId, t.userId)
    .where(sql`${t.isDefault} = true`),
]))

/**
 * Folders for organising conversations in the sidebar. Per-user.
 */
export const chatbotFolder = pgTable('chatbot_folder', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Lucide icon name. Optional. */
  icon: text('icon'),
  /** Manual sort order, ascending. */
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('chatbot_folder_org_user_idx').on(t.organizationId, t.userId),
]))

/**
 * A persisted chatbot conversation. Belongs to a user, optionally filed under
 * a folder, optionally bound to a specific custom agent.
 */
export const chatbotConversation = pgTable('chatbot_conversation', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => chatbotFolder.id, { onDelete: 'set null' }),
  agentId: text('agent_id').references(() => chatbotAgent.id, { onDelete: 'set null' }),
  /** AI configuration last used for this conversation. Falls back to org chatbot default. */
  aiConfigId: text('ai_config_id').references(() => aiConfig.id, { onDelete: 'set null' }),
  /** Human-friendly title. Auto-generated from the first user message if absent. */
  title: text('title').notNull().default('New chat'),
  /** Scope at the time of last message: { kind: 'organization' } or { kind: 'job', jobId } */
  scope: jsonb('scope').notNull().$type<{ kind: 'organization' | 'job'; jobId?: string }>(),
  /** Whether extended thinking was enabled for the most recent turn. */
  thinking: boolean('thinking').notNull().default(false),
  /** Pinned to the top of the sidebar list. */
  pinned: boolean('pinned').notNull().default(false),
  /** Cached preview of last message — avoids loading messages just for the list. */
  lastMessagePreview: text('last_message_preview'),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('chatbot_conversation_org_user_idx').on(t.organizationId, t.userId),
  index('chatbot_conversation_folder_idx').on(t.folderId),
  index('chatbot_conversation_last_message_at_idx').on(t.userId, t.lastMessageAt),
]))

/**
 * Persisted message belonging to a conversation. We mirror the wire shape of
 * ChatbotMessage but normalize a few server-side fields (toolCalls, sources).
 */
export const chatbotMessage = pgTable('chatbot_message', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id').notNull().references(() => chatbotConversation.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: chatbotMessageRoleEnum('role').notNull(),
  content: text('content').notNull().default(''),
  reasoning: text('reasoning'),
  /** Persisted ChatbotToolCall[]. */
  toolCalls: jsonb('tool_calls').$type<unknown[]>(),
  /** Persisted ChatbotSource[] (jobs / candidates / applications referenced). */
  sources: jsonb('sources').$type<unknown[]>(),
  /** Attachment metadata snapshots (no raw file content). */
  attachments: jsonb('attachments').$type<unknown[]>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('chatbot_message_conversation_idx').on(t.conversationId, t.createdAt),
]))

export const chatbotAgentRelations = relations(chatbotAgent, ({ many }) => ({
  conversations: many(chatbotConversation),
}))

export const chatbotFolderRelations = relations(chatbotFolder, ({ many }) => ({
  conversations: many(chatbotConversation),
}))

export const chatbotConversationRelations = relations(chatbotConversation, ({ one, many }) => ({
  organization: one(organization, { fields: [chatbotConversation.organizationId], references: [organization.id] }),
  user: one(user, { fields: [chatbotConversation.userId], references: [user.id] }),
  folder: one(chatbotFolder, { fields: [chatbotConversation.folderId], references: [chatbotFolder.id] }),
  agent: one(chatbotAgent, { fields: [chatbotConversation.agentId], references: [chatbotAgent.id] }),
  aiConfig: one(aiConfig, { fields: [chatbotConversation.aiConfigId], references: [aiConfig.id] }),
  messages: many(chatbotMessage),
}))

export const chatbotMessageRelations = relations(chatbotMessage, ({ one }) => ({
  conversation: one(chatbotConversation, { fields: [chatbotMessage.conversationId], references: [chatbotConversation.id] }),
}))

// ─────────────────────────────────────────────
// Career Page
// ─────────────────────────────────────────────

/**
 * Per-organization branded career page configuration.
 *
 * Customization is deliberately guardrailed: the org supplies identity only —
 * its logo and name (already on `organization`), one accent color, an optional
 * headline and short description, and an on/off switch. Reqcore owns the
 * layout. No fonts, CSS, or layout controls are exposed. Custom domain is a
 * later paid upgrade, not this table.
 *
 * One row per organization — upserted on first edit. Absence of a row means the
 * org has never customized its page and defaults apply (accent = brand, headline
 * derived from the org name). Every plan includes the `careerPage` feature, so
 * the page is live unless the org has explicitly disabled it.
 */
export const careerPage = pgTable('career_page', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  /**
   * Optional custom public slug for the /career/:slug URL. NULL falls back to the
   * organization slug. Shares the /career namespace with organization slugs, so
   * uniqueness is enforced across both on save.
   */
  slug: text('slug'),
  /** Master switch — when false the public career page shows an "unavailable" state. */
  enabled: boolean('enabled').notNull().default(true),
  /** Single accent color as a hex string (e.g. "#4f46e5"). NULL falls back to the brand color. */
  accentColor: text('accent_color'),
  /** Optional hero headline. NULL -> "Open roles at {org name}". */
  headline: text('headline'),
  /** Optional short company intro shown under the headline. */
  description: text('description'),
  /**
   * S3 storage key for a career-page-specific logo. NULL falls back to the
   * organization logo. Served publicly via /api/public/career-page/:slug/asset.
   */
  logoStorageKey: text('logo_storage_key'),
  /**
   * S3 storage key for the hero banner image. NULL renders the plain accent
   * hero. Served publicly via /api/public/career-page/:slug/asset.
   */
  bannerStorageKey: text('banner_storage_key'),
  /**
   * Vertical focal point for the hero banner, 0–100 (percent). Controls the CSS
   * object-position so admins can reposition which slice of a wide image shows.
   * 50 = centered (default).
   */
  bannerPosition: integer('banner_position').notNull().default(50),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('career_page_organization_id_idx').on(t.organizationId),
  // Nullable unique: Postgres allows many NULLs, so orgs without a custom slug coexist.
  uniqueIndex('career_page_slug_idx').on(t.slug),
]))

export const careerPageRelations = relations(careerPage, ({ one }) => ({
  organization: one(organization, { fields: [careerPage.organizationId], references: [organization.id] }),
}))
