import { z } from 'zod'

// ─────────────────────────────────────────────
// Job question validation schemas
// ─────────────────────────────────────────────

const questionTypes = ['short_text', 'long_text', 'single_select', 'multi_select', 'number', 'date', 'url', 'checkbox', 'file_upload', 'info', 'rating'] as const

/** Max size of an info block's rich HTML body (allows a couple of inline base64 images). */
const MAX_CONTENT_LENGTH = 5_000_000

/** Rating scale bounds (columns on the matrix). */
export const RATING_MIN_SCALE = 2
export const RATING_MAX_SCALE = 10

/**
 * Type-specific settings. Only `rating` uses it: `options` holds the rows to
 * rate and this holds the scale plus its optional endpoint captions.
 */
export const questionConfigSchema = z.object({
  ratingMax: z.number().int().min(RATING_MIN_SCALE).max(RATING_MAX_SCALE).optional(),
  ratingMinLabel: z.string().trim().max(100).nullish(),
  ratingMaxLabel: z.string().trim().max(100).nullish(),
  /**
   * Branching: show this question only when another question's answer matches.
   * `questionId` holds a real question id, or — from the create-job wizard,
   * where ids don't exist yet — the controlling question's `ref`.
   */
  visibleWhen: z.object({
    questionId: z.string().min(1).max(100),
    values: z.array(z.string().max(200)).min(1).max(50),
  }).nullish(),
})

/** `rating` reuses `options` for its rows, so both need the same option checks. */
function usesOptions(type: typeof questionTypes[number]) {
  return type === 'single_select' || type === 'multi_select' || type === 'rating'
}

function validateSelectOptions(
  data: { type: typeof questionTypes[number], options?: string[] | null },
  ctx: z.RefinementCtx,
) {
  if (!usesOptions(data.type)) return

  if (!data.options?.length) {
    ctx.addIssue({
      code: 'custom',
      message: data.type === 'rating'
        ? 'At least one item to rate is required for rating questions'
        : 'Options are required for select-type questions',
      path: ['options'],
    })
    return
  }

  const normalized = data.options.map(option => option.toLocaleLowerCase())
  if (new Set(normalized).size !== normalized.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'Options must be unique',
      path: ['options'],
    })
  }
}

/** Info blocks carry rich HTML in `content` and don't need a label; other
 *  question types require a label. Runs after the select-option check. */
function validateInfoOrLabel(
  data: { type: typeof questionTypes[number], label?: string, content?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.type === 'info') {
    if (!data.content || !data.content.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Content is required for information blocks', path: ['content'] })
    }
  }
  else if (!data.label || !data.label.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Label is required', path: ['label'] })
  }
}

/** Schema for creating a new custom question */
export const createQuestionSchema = z.object({
  label: z.string().trim().max(500).optional().default(''),
  type: z.enum(questionTypes).default('short_text'),
  description: z.string().trim().max(1000).optional(),
  content: z.string().max(MAX_CONTENT_LENGTH).optional(),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).min(1).max(50).optional(),
  config: questionConfigSchema.nullish(),
  /** Client-side id used by the create-job wizard to wire up branch conditions. */
  ref: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).default(0),
  /** Optional wizard section/page this question belongs to. Null = default page. */
  sectionId: z.string().min(1).nullish(),
}).superRefine((data, ctx) => {
  validateSelectOptions(data, ctx)
  validateInfoOrLabel(data, ctx)
})

/** Schema for updating an existing question (all fields optional) */
export const updateQuestionSchema = z.object({
  label: z.string().trim().max(500).optional(),
  type: z.enum(questionTypes).optional(),
  description: z.string().trim().max(1000).nullish(),
  content: z.string().max(MAX_CONTENT_LENGTH).nullish(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(200)).min(1).max(50).nullish(),
  config: questionConfigSchema.nullish(),
  displayOrder: z.number().int().min(0).optional(),
  /** Pass null to move the question back to the default page. */
  sectionId: z.string().min(1).nullish(),
})

// ─────────────────────────────────────────────
// Job question section (wizard page) schemas
// ─────────────────────────────────────────────

/** Schema for creating a new section (wizard page) */
export const createSectionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(1000).optional(),
  displayOrder: z.number().int().min(0).default(0),
})

/** Schema for updating a section (all fields optional) */
export const updateSectionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullish(),
  displayOrder: z.number().int().min(0).optional(),
})

/** Schema for bulk reordering sections */
export const reorderSectionsSchema = z.object({
  order: z.array(
    z.object({
      id: z.string().min(1),
      displayOrder: z.number().int().min(0),
    }),
  ).min(1),
})

/** Route param schema for job id + sectionId */
export const sectionIdParamSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
})

/** Validates invariants after an existing question and a partial update are merged. */
export const questionStateSchema = z.object({
  type: z.enum(questionTypes),
  options: z.array(z.string().trim().min(1).max(200)).min(1).max(50).nullish(),
}).superRefine(validateSelectOptions)

/** Schema for bulk reordering questions */
export const reorderQuestionsSchema = z.object({
  order: z.array(
    z.object({
      id: z.string().min(1),
      displayOrder: z.number().int().min(0),
    }),
  ).min(1),
})

/** Route param schema for job id */
export const jobIdParamSchema = z.object({
  id: z.string().min(1),
})

/** Route param schema for job id + questionId */
export const questionIdParamSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
})
