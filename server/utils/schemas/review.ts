import { z } from 'zod'

// ─── Reviewer rating schemas ───────────────────────────────────────

export const reviewStages = ['screening', 'interview'] as const

/**
 * Upsert a reviewer's rating + notes for one applicant at one stage.
 * At least one of `rating` / `notes` must be provided (notes-only allowed).
 */
export const createReviewSchema = z.object({
  applicationId: z.string().uuid(),
  stage: z.enum(reviewStages),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  notes: z.string().max(10000).nullish(),
}).refine(
  d => (d.rating !== null && d.rating !== undefined) || (d.notes !== null && d.notes !== undefined && d.notes.trim().length > 0),
  { message: 'Provide a rating or notes.' },
)

export const updateReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  notes: z.string().max(10000).nullish(),
}).refine(
  d => d.rating !== undefined || d.notes !== undefined,
  { message: 'Provide a rating or notes to update.' },
)

export const listReviewQuerySchema = z.object({
  applicationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
}).refine(
  q => Boolean(q.applicationId) || Boolean(q.jobId),
  { message: 'applicationId or jobId is required.' },
)

export const reviewIdParamSchema = z.object({
  id: z.string().uuid(),
})
