import { z } from 'zod'

/**
 * Validation schemas for the org-configurable employment-type list.
 * A job's `type` column stores the chosen label directly, so these rows are
 * simply the editable set of labels offered in the job form's picker.
 */

export const createEmploymentTypeSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60, 'Label must be 60 characters or less'),
  displayOrder: z.number().int().min(0).optional(),
})

export const updateEmploymentTypeSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60, 'Label must be 60 characters or less').optional(),
  displayOrder: z.number().int().min(0).optional(),
})

export type CreateEmploymentTypeInput = z.infer<typeof createEmploymentTypeSchema>
export type UpdateEmploymentTypeInput = z.infer<typeof updateEmploymentTypeSchema>
