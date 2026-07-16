/**
 * Guard AI-scoring endpoints behind the `ai-scoring` feature flag.
 *
 * AI resume scoring is hidden by default (human reviewer ratings replace it).
 * Call this right after auth in every scoring route so the endpoints no-op
 * (404) while the flag is off, matching the hidden UI. Flip the flag on to
 * restore the feature — nothing is deleted.
 */
export async function assertAiScoringEnabled(distinctId: string, organizationId?: string): Promise<void> {
  const enabled = await resolveServerFeatureFlag('ai-scoring', {
    distinctId,
    ...(organizationId ? { groups: { organization: organizationId } } : {}),
  })
  if (!enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}
