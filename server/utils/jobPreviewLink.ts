/**
 * A preview link is usable only while it is neither revoked nor past its
 * expiry. Callers treat every unusable case the same way (404) so a token
 * can't be probed for its state.
 */
export function isPreviewLinkUsable(
  link: { expiresAt: Date | string, revokedAt: Date | string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!link) return false
  if (link.revokedAt) return false
  return new Date(link.expiresAt).getTime() > now.getTime()
}
