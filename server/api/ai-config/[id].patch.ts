import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig, platformAiConfig } from '../../database/schema'
import { updateAiConfigSchema } from '../../utils/schemas/scoring'
import { encrypt } from '../../utils/encryption'
import {
  canUsePlatformAi,
  DEFAULT_PLATFORM_AI_NAME,
  DEFAULT_PLATFORM_MAX_TOKENS,
  getPlatformAiOverride,
  PLATFORM_AI_CONFIG_ID,
  PLATFORM_AI_PROVIDER,
  toPlatformAiConfigListRow,
} from '../../utils/ai/platformConfig'

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * PATCH /api/ai-config/:id
 *
 * Update an AI configuration. Re-encrypts the API key only when supplied,
 * so users can edit name / model / pricing without re-entering credentials.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, updateAiConfigSchema.parse)

  if (id === PLATFORM_AI_CONFIG_ID) {
    if (!await canUsePlatformAi(orgId)) {
      throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })
    }
    if (body.provider !== undefined && body.provider !== PLATFORM_AI_PROVIDER) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The platform AI configuration must use OpenRouter.',
      })
    }
    if (body.baseUrl != null) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The platform AI configuration uses the server OpenRouter endpoint.',
      })
    }
    if (body.apiKey) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The platform OpenRouter key is managed on the server.',
      })
    }

    const existingOverride = await getPlatformAiOverride(orgId)
    const orgConfigCount = await db.$count(aiConfig, eq(aiConfig.organizationId, orgId))
    const [updated] = await db.insert(platformAiConfig)
      .values({
        organizationId: orgId,
        name: body.name ?? existingOverride?.name ?? DEFAULT_PLATFORM_AI_NAME,
        provider: PLATFORM_AI_PROVIDER,
        model: body.model ?? existingOverride?.model ?? env.OPENROUTER_MODEL,
        maxTokens: body.maxTokens ?? existingOverride?.maxTokens ?? DEFAULT_PLATFORM_MAX_TOKENS,
        inputPricePer1m: body.inputPricePer1m !== undefined
          ? (body.inputPricePer1m != null ? String(body.inputPricePer1m) : null)
          : existingOverride?.inputPricePer1m ?? null,
        outputPricePer1m: body.outputPricePer1m !== undefined
          ? (body.outputPricePer1m != null ? String(body.outputPricePer1m) : null)
          : existingOverride?.outputPricePer1m ?? null,
        isDefaultAnalysis: existingOverride?.isDefaultAnalysis ?? orgConfigCount === 0,
        isEnabled: true,
      })
      .onConflictDoUpdate({
        target: platformAiConfig.organizationId,
        set: {
          name: body.name ?? existingOverride?.name ?? DEFAULT_PLATFORM_AI_NAME,
          provider: PLATFORM_AI_PROVIDER,
          model: body.model ?? existingOverride?.model ?? env.OPENROUTER_MODEL,
          maxTokens: body.maxTokens ?? existingOverride?.maxTokens ?? DEFAULT_PLATFORM_MAX_TOKENS,
          inputPricePer1m: body.inputPricePer1m !== undefined
            ? (body.inputPricePer1m != null ? String(body.inputPricePer1m) : null)
            : existingOverride?.inputPricePer1m ?? null,
          outputPricePer1m: body.outputPricePer1m !== undefined
            ? (body.outputPricePer1m != null ? String(body.outputPricePer1m) : null)
            : existingOverride?.outputPricePer1m ?? null,
          isEnabled: true,
          updatedAt: new Date(),
        },
      })
      .returning()

    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'aiConfig',
      resourceId: id,
      metadata: { source: 'platform' },
    })

    return { config: toPlatformAiConfigListRow(updated!) }
  }

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.provider !== undefined) updates.provider = body.provider
  if (body.model !== undefined) updates.model = body.model
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl ?? null
  if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens
  if (body.inputPricePer1m !== undefined) updates.inputPricePer1m = body.inputPricePer1m != null ? String(body.inputPricePer1m) : null
  if (body.outputPricePer1m !== undefined) updates.outputPricePer1m = body.outputPricePer1m != null ? String(body.outputPricePer1m) : null
  if (body.apiKey) updates.apiKeyEncrypted = encrypt(body.apiKey, env.BETTER_AUTH_SECRET)

  const [updated] = await db.update(aiConfig)
    .set(updates)
    .where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))
    .returning({
      id: aiConfig.id,
      name: aiConfig.name,
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      maxTokens: aiConfig.maxTokens,
      inputPricePer1m: aiConfig.inputPricePer1m,
      outputPricePer1m: aiConfig.outputPricePer1m,
      isDefaultChatbot: aiConfig.isDefaultChatbot,
      isDefaultAnalysis: aiConfig.isDefaultAnalysis,
      apiKeyEncrypted: aiConfig.apiKeyEncrypted,
    })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'aiConfig',
    resourceId: id,
  })

  const { apiKeyEncrypted, ...rest } = updated!
  return {
    config: {
      ...rest,
      inputPricePer1m: rest.inputPricePer1m != null ? Number(rest.inputPricePer1m) : null,
      outputPricePer1m: rest.outputPricePer1m != null ? Number(rest.outputPricePer1m) : null,
      hasApiKey: Boolean(apiKeyEncrypted),
    },
  }
})
