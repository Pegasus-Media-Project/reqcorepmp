import { chromium } from '@playwright/test'

(async () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:3000'
  const launchOptions = {
    ...(process.env.CHROME_EXECUTABLE_PATH && { executablePath: process.env.CHROME_EXECUTABLE_PATH }),
    ...(process.env.PLAYWRIGHT_DISABLE_SANDBOX === '1' && {
      // Useful for root/container runs where Chromium sandboxing is unavailable.
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }),
  }

  const browser = await chromium.launch({
    ...launchOptions,
  })

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()

    // Screenshot sign-in page
    await page.goto(new URL('/auth/sign-in', baseUrl).toString())
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: '/tmp/debug-signin-page.png' })
    console.log('Screenshot: sign-in page loaded')

    // Log inputs on the page
    const inputs = await page.locator('input').all()
    for (const input of inputs) {
      const type = await input.getAttribute('type')
      const placeholder = await input.getAttribute('placeholder')
      console.log('Input:', type, placeholder)
    }
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error('Script failed:', error)
  process.exit(1)
})
