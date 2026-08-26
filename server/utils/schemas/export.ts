import { z } from 'zod'
import { applicationQuerySchema } from './application'

// ─────────────────────────────────────────────
// Export schemas (applications, interviews, ratings)
// ─────────────────────────────────────────────

export const exportFormatSchema = z.enum(['xlsx', 'pdf'])
export type ExportFormat = z.infer<typeof exportFormatSchema>

/** Hard cap on one PDF export — every applicant becomes rendered pages. */
export const MAX_EXPORT_ROWS = 200

/** Spreadsheets are one row per applicant, so "everything" can mean everything. */
export const MAX_XLSX_EXPORT_ROWS = 10000

/**
 * Export a hand-picked set of applications, or everything matching the list's
 * current filters. `applicationIds` wins when present; otherwise the filters
 * are re-run server-side so "all" means what the list is showing.
 */
export const applicationExportSchema = z.object({
  format: exportFormatSchema,
  applicationIds: z.array(z.string().min(1)).min(1).max(MAX_XLSX_EXPORT_ROWS).optional(),
  filters: applicationQuerySchema
    .pick({ jobId: true, candidateId: true, status: true, search: true, score: true, interview: true, propertyFilters: true })
    .optional(),
})

/** Export selected interviews, or every interview matching the board's filters. */
export const interviewExportSchema = z.object({
  format: exportFormatSchema,
  interviewIds: z.array(z.string().min(1)).min(1).max(MAX_EXPORT_ROWS).optional(),
  jobId: z.string().min(1).optional(),
})

/** Export a job's rating aggregate — all applicants, or a hand-picked set. */
export const ratingsExportSchema = z.object({
  format: z.enum(['xlsx', 'pdf', 'csv']),
  applicationIds: z.array(z.string().min(1)).min(1).max(MAX_EXPORT_ROWS).optional(),
})
