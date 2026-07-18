/**
 * HTML → PDF rendering via a headless browser (puppeteer-core).
 *
 * This is the single place that owns the browser dependency. Callers pass a
 * self-contained HTML string and get back a PDF Buffer — they never touch
 * puppeteer directly.
 *
 * A Chromium/Chrome binary must be available at runtime:
 *   - In production (Alpine Docker image) install the system package and point
 *     PUPPETEER_EXECUTABLE_PATH at it, e.g. `apk add chromium` →
 *     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
 *   - In local dev the util falls back to common Chrome/Chromium install paths.
 */
import { existsSync } from 'node:fs'
import type { Browser } from 'puppeteer-core'
import { launch } from 'puppeteer-core'

/** Candidate executable paths tried (in order) when the env var is unset. */
const FALLBACK_EXECUTABLE_PATHS = [
  // Linux (Alpine / Debian)
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

function resolveExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (fromEnv) return fromEnv

  for (const p of FALLBACK_EXECUTABLE_PATHS) {
    try {
      if (existsSync(p)) return p
    }
    catch { /* ignore and try next */ }
  }
  return undefined
}

// Reuse a single browser instance across requests — launching Chromium is
// expensive (~hundreds of ms). Guard against concurrent launches.
let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise
      if (existing.connected) return existing
    }
    catch {
      // fall through and relaunch
    }
    browserPromise = null
  }

  browserPromise = launch({
    executablePath: resolveExecutablePath(),
    headless: true,
    // --no-sandbox is required to run Chromium as a non-root/limited user in
    // most container environments.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }).catch((err) => {
    browserPromise = null
    throw err
  })

  return browserPromise
}

export interface RenderPdfOptions {
  /** Paper format. Defaults to A4. */
  format?: 'A4' | 'Letter'
  /** Page margin (CSS size string). Defaults to 16mm all around. */
  margin?: string
}

/**
 * Render a self-contained HTML string to a PDF Buffer.
 * Throws if no Chromium/Chrome binary can be found or launched.
 */
export async function renderHtmlToPdf(html: string, opts: RenderPdfOptions = {}): Promise<Buffer> {
  let browser: Browser
  try {
    browser = await getBrowser()
  }
  catch (err) {
    logError('pdf.browser_launch_failed', {
      error_message: err instanceof Error ? err.message : String(err),
    })
    throw createError({
      statusCode: 503,
      statusMessage: 'PDF export is unavailable: no Chromium/Chrome runtime is configured. Set PUPPETEER_EXECUTABLE_PATH.',
    })
  }

  const page = await browser.newPage()
  try {
    // The HTML is fully self-contained; 'load' is sufficient. A hard timeout
    // guards against a hung render.
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 })
    const margin = opts.margin ?? '16mm'
    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
    })
    return Buffer.from(pdf)
  }
  finally {
    await page.close().catch(() => {})
  }
}
