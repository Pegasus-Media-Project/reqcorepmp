import { eq } from 'drizzle-orm'
import { platformAiConfig } from '../../database/schema'
import { encrypt } from '../encryption'
import { resolveOrgPlanId } from '../billing/plan'
import { OPENROUTER_BASE_URL, type ProviderConfig } from './provider'

export const PLATFORM_AI_CONFIG_ID = '__platform__'
export const PLATFORM_AI_PROVIDER = 'openrouter'
export const DEFAULT_PLATFORM_AI_NAME = 'Platform (OpenRouter)'
export const DEFAULT_PLATFORM_MAX_TOKENS = 4096

type PlatformAiOverride = typeof platformAiConfig.$inferSelect

export interface PlatformAiConfigListRow {
  id: typeof PLATFORM_AI_CONFIG_ID
  name: string
  provider: typeof PLATFORM_AI_PROVIDER
  model: string
  baseUrl: null
  maxTokens: number
  inputPricePer1m: number | null
  outputPricePer1m: number | null
  isDefaultChatbot: false
  isDefaultAnalysis: boolean
  hasApiKey: boolean
  source: 'platform'
  createdAt: Date
  updatedAt: Date
}

export async function getPlatformAiOverride(orgId: string): Promise<PlatformAiOverride | null> {
  return await db.query.platformAiConfig.findFirst({
    where: eq(platformAiConfig.organizationId, orgId),
  }) ?? null
}

export async function canUsePlatformAi(orgId: string): Promise<boolean> {
  return Boolean(env.OPENROUTER_API_KEY) && (await resolveOrgPlanId(orgId)) !== 'grandfathered'
}

function platformModel(row: PlatformAiOverride | null): string {
  return row?.model ?? env.OPENROUTER_MODEL
}

function platformName(row: PlatformAiOverride | null): string {
  return row?.name ?? DEFAULT_PLATFORM_AI_NAME
}

function platformMaxTokens(row: PlatformAiOverride | null): number {
  return row?.maxTokens ?? DEFAULT_PLATFORM_MAX_TOKENS
}

export function platformOverrideEnabled(row: PlatformAiOverride | null): boolean {
  return row?.isEnabled ?? true
}

export function toPlatformAiConfigListRow(row: PlatformAiOverride | null): PlatformAiConfigListRow {
  return {
    id: PLATFORM_AI_CONFIG_ID,
    name: platformName(row),
    provider: PLATFORM_AI_PROVIDER,
    model: platformModel(row),
    baseUrl: null,
    maxTokens: platformMaxTokens(row),
    inputPricePer1m: row?.inputPricePer1m != null ? Number(row.inputPricePer1m) : null,
    outputPricePer1m: row?.outputPricePer1m != null ? Number(row.outputPricePer1m) : null,
    isDefaultChatbot: false,
    isDefaultAnalysis: row?.isDefaultAnalysis ?? true,
    hasApiKey: Boolean(env.OPENROUTER_API_KEY),
    source: 'platform',
    createdAt: row?.createdAt ?? new Date(0),
    updatedAt: row?.updatedAt ?? new Date(0),
  }
}

export async function resolvePlatformAiProviderConfig(
  orgId: string,
  opts: { requireEnabled?: boolean } = {},
): Promise<{ providerConfig: ProviderConfig, provider: typeof PLATFORM_AI_PROVIDER, model: string }> {
  if (!await canUsePlatformAi(orgId)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Platform OpenRouter AI is not available for this workspace.',
    })
  }

  const row = await getPlatformAiOverride(orgId)
  if (opts.requireEnabled !== false && !platformOverrideEnabled(row)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Platform OpenRouter AI has been removed for this workspace.',
    })
  }

  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Platform OpenRouter AI is not configured on this server.',
    })
  }

  const model = platformModel(row)
  return {
    providerConfig: {
      provider: PLATFORM_AI_PROVIDER,
      model,
      apiKeyEncrypted: encrypt(apiKey, env.BETTER_AUTH_SECRET),
      baseUrl: OPENROUTER_BASE_URL,
      maxTokens: platformMaxTokens(row),
    },
    provider: PLATFORM_AI_PROVIDER,
    model,
  }
}
