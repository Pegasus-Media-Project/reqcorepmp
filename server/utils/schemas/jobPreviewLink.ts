import { z } from 'zod'

// ─────────────────────────────────────────────
// Job application-form preview link schemas
// ─────────────────────────────────────────────

/** How long a freshly-created preview link stays usable, in days. */
export const PREVIEW_LINK_MIN_DAYS = 1
export const PREVIEW_LINK_MAX_DAYS = 90
export const PREVIEW_LINK_DEFAULT_DAYS = 14

/** Schema for creating (or rotating) a job's preview link */
export const createJobPreviewLinkSchema = z.object({
  expiresInDays: z.coerce.number().int()
    .min(PREVIEW_LINK_MIN_DAYS)
    .max(PREVIEW_LINK_MAX_DAYS)
    .optional()
    .default(PREVIEW_LINK_DEFAULT_DAYS),
})

/** Route param schema for the public preview endpoint */
export const jobPreviewTokenSchema = z.object({
  token: z.string().min(16).max(200),
})
