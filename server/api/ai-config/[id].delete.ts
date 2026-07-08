import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig, platformAiConfig } from '../../database/schema'
import {
  canUsePlatformAi,
  DEFAULT_PLATFORM_AI_NAME,
  DEFAULT_PLATFORM_MAX_TOKENS,
  getPlatformAiOverride,
  PLATFORM_AI_CONFIG_ID,
  PLATFORM_AI_PROVIDER,
} from '../../utils/ai/platformConfig'

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * DELETE /api/ai-config/:id
 *
 * Deletes an AI configuration. If it was a default for chatbot/analysis,
 * the most recently created remaining config is automatically promoted to
 * fill the slot — so the org never silently loses its AI capability.
 *
 * Conversations referencing this config keep working: the FK uses ON DELETE
 * SET NULL and the chat handler falls back to the org default.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  if (id === PLATFORM_AI_CONFIG_ID) {
    if (!await canUsePlatformAi(orgId)) {
      throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })
    }
    const existingOverride = await getPlatformAiOverride(orgId)
    const wasDefaultAnalysis = existingOverride?.isDefaultAnalysis ?? true

    await db.transaction(async (tx) => {
      await tx.insert(platformAiConfig)
        .values({
          organizationId: orgId,
          name: existingOverride?.name ?? DEFAULT_PLATFORM_AI_NAME,
          provider: PLATFORM_AI_PROVIDER,
          model: existingOverride?.model ?? env.OPENROUTER_MODEL,
          maxTokens: existingOverride?.maxTokens ?? DEFAULT_PLATFORM_MAX_TOKENS,
          inputPricePer1m: existingOverride?.inputPricePer1m ?? null,
          outputPricePer1m: existingOverride?.outputPricePer1m ?? null,
          isDefaultAnalysis: false,
          isEnabled: false,
        })
        .onConflictDoUpdate({
          target: platformAiConfig.organizationId,
          set: {
            isDefaultAnalysis: false,
            isEnabled: false,
            updatedAt: new Date(),
          },
        })

      if (wasDefaultAnalysis) {
        const successor = await tx.query.aiConfig.findFirst({
          where: eq(aiConfig.organizationId, orgId),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          columns: { id: true },
        })
        if (successor) {
          await tx.update(aiConfig)
            .set({ isDefaultAnalysis: true, updatedAt: new Date() })
            .where(eq(aiConfig.id, successor.id))
        }
      }
    })

    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'deleted',
      resourceType: 'aiConfig',
      resourceId: id,
      metadata: { source: 'platform' },
    })

    return { success: true }
  }

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true, isDefaultChatbot: true, isDefaultAnalysis: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  await db.transaction(async (tx) => {
    await tx.delete(aiConfig).where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))

    // Promote a successor for any default slot we just vacated.
    if (existing.isDefaultChatbot || existing.isDefaultAnalysis) {
      const successor = await tx.query.aiConfig.findFirst({
        where: and(eq(aiConfig.organizationId, orgId), ne(aiConfig.id, id)),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        columns: { id: true },
      })
      if (successor) {
        const promote: Record<string, unknown> = { updatedAt: new Date() }
        if (existing.isDefaultChatbot) promote.isDefaultChatbot = true
        if (existing.isDefaultAnalysis) promote.isDefaultAnalysis = true
        await tx.update(aiConfig).set(promote).where(eq(aiConfig.id, successor.id))
      }
      else if (existing.isDefaultAnalysis) {
        const platformOverride = await tx.query.platformAiConfig.findFirst({
          where: eq(platformAiConfig.organizationId, orgId),
          columns: { id: true, isEnabled: true },
        })
        if (platformOverride?.isEnabled) {
          await tx.update(platformAiConfig)
            .set({ isDefaultAnalysis: true, updatedAt: new Date() })
            .where(eq(platformAiConfig.id, platformOverride.id))
        }
      }
    }
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'aiConfig',
    resourceId: id,
  })

  return { success: true }
})
