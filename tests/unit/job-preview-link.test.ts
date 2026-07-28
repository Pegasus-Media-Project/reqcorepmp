import { describe, it, expect } from 'vitest'
import { isPreviewLinkUsable } from '../../server/utils/jobPreviewLink'
import {
  createJobPreviewLinkSchema,
  jobPreviewTokenSchema,
  PREVIEW_LINK_DEFAULT_DAYS,
} from '../../server/utils/schemas/jobPreviewLink'

const NOW = new Date('2026-07-27T12:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)

describe('job preview links', () => {
  describe('isPreviewLinkUsable', () => {
    it('accepts a live link', () => {
      expect(isPreviewLinkUsable({ expiresAt: inDays(3), revokedAt: null }, NOW)).toBe(true)
    })

    it('rejects a revoked link even when it has not expired', () => {
      expect(isPreviewLinkUsable({ expiresAt: inDays(3), revokedAt: NOW }, NOW)).toBe(false)
    })

    it('rejects an expired link', () => {
      expect(isPreviewLinkUsable({ expiresAt: inDays(-1), revokedAt: null }, NOW)).toBe(false)
      // Exactly at the expiry instant counts as expired.
      expect(isPreviewLinkUsable({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false)
    })

    it('rejects a missing link', () => {
      expect(isPreviewLinkUsable(null, NOW)).toBe(false)
      expect(isPreviewLinkUsable(undefined, NOW)).toBe(false)
    })

    it('handles serialized dates', () => {
      expect(isPreviewLinkUsable({ expiresAt: inDays(2).toISOString(), revokedAt: null }, NOW)).toBe(true)
    })
  })

  describe('schemas', () => {
    it('defaults the lifetime when none is given', () => {
      const parsed = createJobPreviewLinkSchema.parse({})
      expect(parsed.expiresInDays).toBe(PREVIEW_LINK_DEFAULT_DAYS)
    })

    it('bounds the requested lifetime', () => {
      expect(createJobPreviewLinkSchema.safeParse({ expiresInDays: 0 }).success).toBe(false)
      expect(createJobPreviewLinkSchema.safeParse({ expiresInDays: 91 }).success).toBe(false)
      expect(createJobPreviewLinkSchema.safeParse({ expiresInDays: 30 }).success).toBe(true)
    })

    it('rejects tokens that are too short to be real', () => {
      expect(jobPreviewTokenSchema.safeParse({ token: 'abc' }).success).toBe(false)
      expect(jobPreviewTokenSchema.safeParse({ token: 'a'.repeat(64) }).success).toBe(true)
    })
  })
})
