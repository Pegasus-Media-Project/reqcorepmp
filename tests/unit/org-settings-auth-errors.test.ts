import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsPage = readFileSync(
  resolve(process.cwd(), 'app/pages/dashboard/settings/index.vue'),
  'utf8',
)

describe('organization settings auth client errors', () => {
  it('does not treat Better Auth update errors as successful saves', () => {
    expect(settingsPage).toMatch(/const result = await authClient\.organization\.update/)
    expect(settingsPage).toMatch(/if \(result\.error\)[\s\S]*Failed to update organization/)
    expect(settingsPage.indexOf('if (result.error)')).toBeLessThan(
      settingsPage.indexOf("track('org_settings_saved')"),
    )
  })

  it('does not navigate away when Better Auth delete returns an error', () => {
    expect(settingsPage).toMatch(/const result = await authClient\.organization\.delete/)
    expect(settingsPage).toMatch(/if \(result\.error\)[\s\S]*Failed to delete organization/)
    expect(settingsPage.indexOf("track('org_deleted')")).toBeLessThan(
      settingsPage.indexOf("await navigateTo(localePath('/onboarding/create-org')"),
    )
    expect(settingsPage.indexOf('if (result.error)', settingsPage.indexOf('organization.delete'))).toBeLessThan(
      settingsPage.indexOf("track('org_deleted')"),
    )
  })
})
