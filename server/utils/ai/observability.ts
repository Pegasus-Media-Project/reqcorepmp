/**
 * PostHog LLM observability for analysis runs.
 *
 * Emits a `$ai_generation` event (PostHog's LLM-observability schema) so AI
 * spend shows up next to product analytics — e.g. cost per converted customer,
 * which features burn tokens. This is the *behavioural* lens; it is NOT the
 * money-safety layer (that's budget.ts) nor the billing source of truth (that's
 * the OpenRouter invoice). Numbers here won't reconcile to the penny, by design.
 *
 * Fire-and-forget: tracking must never break or slow a scoring run.
 */
import { useServerPostHog } from '../posthog'
import { microsToUsd } from './pricing'

export interface AiGenerationEvent {
  orgId: string
  userId?: string | null
  applicationId: string
  provider: string
  model: string
  billingMode: 'platform' | 'byok'
  promptTokens: number
  completionTokens: number
  costUsdMicros: number | null
  latencyMs: number
  status: 'completed' | 'failed'
  analysisRunId?: string
}

export function captureAiGeneration(e: AiGenerationEvent): void {
  try {
    const ph = useServerPostHog()
    if (!ph) return

    ph.capture({
      distinctId: e.userId || 'system',
      event: '$ai_generation',
      groups: { organization: e.orgId },
      properties: {
        $ai_provider: e.provider,
        $ai_model: e.model,
        $ai_input_tokens: e.promptTokens,
        $ai_output_tokens: e.completionTokens,
        $ai_latency: e.latencyMs / 1000,
        $ai_total_cost_usd: e.costUsdMicros != null ? microsToUsd(e.costUsdMicros) : undefined,
        $ai_is_error: e.status === 'failed',
        $ai_trace_id: e.analysisRunId,
        // Reqcore-specific dimensions for product/cost analysis.
        billing_mode: e.billingMode,
        application_id: e.applicationId,
        feature: 'application_analysis',
      },
    })
  }
  catch {
    // Observability must never break the primary operation.
  }
}
