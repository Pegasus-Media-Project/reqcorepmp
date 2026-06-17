const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/google-chrome',
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Screenshot sign-in page
  await page.goto('http://localhost:3000/auth/sign-in');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/step3-01-signin.png' });
  console.log('Screenshot 1: sign-in page loaded');

  // Log inputs on the page
  const inputs = await page.locator('input').all();
  for (const input of inputs) {
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    console.log('Input:', type, placeholder);
  }

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
