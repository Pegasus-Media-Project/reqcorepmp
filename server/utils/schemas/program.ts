import { z } from 'zod'

// ─────────────────────────────────────────────
// Program validation schemas — shared across API routes
// ─────────────────────────────────────────────

/** Schema for creating a new program (e.g. a Pegasus cohort) */
export const createProgramSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(5000).nullish(),
  archived: z.boolean().optional().default(false),
})

/** Schema for updating a program (PATCH semantics — all optional) */
export const updateProgramSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200).optional(),
  description: z.string().trim().max(5000).nullish(),
  archived: z.boolean().optional(),
})

/** Body for assigning a user to a program or job */
export const assignUserSchema = z.object({
  userId: z.string().min(1),
})

/** Reusable schema for `:id` route params */
export const programIdParamSchema = z.object({
  id: z.string().min(1),
})
