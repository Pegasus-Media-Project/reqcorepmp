import { test, expect } from '../fixtures'

/**
 * Critical flow: Recruiter creates and publishes a job.
 *
 * Steps:
 * 1. Sign up + create org (via authenticatedPage fixture)
 * 2. Navigate to "Create Job" page
 * 3. Fill in job details (title, description, location, type)
 * 4. Submit the job
 * 5. Verify the job appears in the job list
 * 6. Open the job and publish it (draft → open)
 * 7. Verify the job is visible on the public jobs page
 */

const JOB_TITLE = 'Senior QA Engineer'
const JOB_DESCRIPTION = 'We are looking for a senior QA engineer to lead our testing efforts.'
const JOB_LOCATION = 'Remote'
const QUESTION_LABEL = 'Which testing framework do you know best?'
const UPDATED_QUESTION_LABEL = 'Which browser testing framework do you know best?'

test.describe('Job Creation Flow', () => {
  test('recruiter can configure the application form and publish a job', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const dismissFeedbackSurvey = async () => {
      await page.getByRole('button', { name: 'No thanks' }).click({ timeout: 2_000 }).catch(() => {})
    }

    // ── Navigate to Create Job ───────────────────────────
    await page.goto('/dashboard/jobs/new')
    await page.waitForLoadState('networkidle')
    await dismissFeedbackSurvey()

    // ── Step 1: Fill in job details ──────────────────────
    // Wait for the form to be fully hydrated before interacting
    await page.getByLabel('Job title').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('Job title').fill(JOB_TITLE)
    await page.getByLabel('Description').fill(JOB_DESCRIPTION)
    await page.getByLabel('Location').fill(JOB_LOCATION)

    // The persistent candidate preview should update as job details are entered.
    const preview = page.getByRole('complementary')
    await expect(preview.getByRole('heading', { name: JOB_TITLE })).toBeVisible()
    await expect(preview.getByText(JOB_LOCATION)).toBeVisible()

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).waitFor({ state: 'attached', timeout: 10_000 })
    await expect(page.locator('form').getByRole('button', { name: 'Save & continue' })).toBeEnabled({ timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).click()

    // ── Step 2: Configure the application form ───────────
    await expect(page.getByText('Customize your application form')).toBeVisible()

    const resumeRequirement = page.getByRole('radiogroup', { name: 'Resume requirement' })
    await resumeRequirement.getByRole('radio', { name: 'Off' }).click()
    await expect(resumeRequirement.getByRole('radio', { name: 'Off' })).toBeChecked()
    await expect(preview.getByText('Resume / CV', { exact: false })).toHaveCount(0)

    const coverLetterRequirement = page.getByRole('radiogroup', { name: 'Cover letter requirement' })
    await coverLetterRequirement.getByRole('radio', { name: 'Required' }).click()
    await expect(coverLetterRequirement.getByRole('radio', { name: 'Required' })).toBeChecked()
    await expect(preview.getByLabel('Cover Letter')).toBeVisible()

    // Add a required single-select question and verify it appears in the preview.
    await page.getByRole('button', { name: 'Add a question', exact: true }).click()
    await page.getByLabel('Question').fill(QUESTION_LABEL)
    await page.getByLabel('Field Type').selectOption('single_select')
    await page.getByPlaceholder('Option 1').fill('Playwright')
    await page.getByRole('button', { name: 'Add option' }).click()
    await page.getByPlaceholder('Option 2').fill('Cypress')
    await page.getByLabel('Required', { exact: true }).check()
    await page.getByRole('button', { name: 'Add Question', exact: true }).click()

    await expect(page.getByText('1 question added')).toBeVisible()
    const previewQuestion = preview.getByLabel(QUESTION_LABEL)
    await expect(previewQuestion).toBeVisible()
    await expect(previewQuestion.getByRole('option', { name: 'Playwright' })).toHaveCount(1)
    await expect(previewQuestion.getByRole('option', { name: 'Cypress' })).toHaveCount(1)

    // Editing must update both the builder row and the candidate preview.
    await page.getByTitle('Edit').click()
    await page.getByLabel('Question').fill(UPDATED_QUESTION_LABEL)
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await expect(preview.getByLabel(UPDATED_QUESTION_LABEL)).toBeVisible()
    await expect(preview.getByLabel(QUESTION_LABEL)).toHaveCount(0)

    // Device switching is part of the new persistent preview.
    const previewDevice = preview.getByRole('radiogroup', { name: 'Preview device' })
    await previewDevice.getByRole('radio', { name: 'Mobile' }).click()
    await expect(previewDevice.getByRole('radio', { name: 'Mobile' })).toBeChecked()

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).waitFor({ state: 'attached', timeout: 10_000 })
    await expect(page.locator('form').getByRole('button', { name: 'Save & continue' })).toBeEnabled({ timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).click()

    // Step 3: Scoring criteria — skip (defaults are fine)
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).waitFor({ state: 'visible', timeout: 10_000 })
    await dismissFeedbackSurvey()
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).click()

    // Step 4: Publish the job
    await expect(page.getByRole('heading', { name: /Ready to go\?/i })).toBeVisible({ timeout: 10_000 })
    const publishButton = page.locator('form').getByRole('button', { name: /Publish & copy link/i })
    await publishButton.waitFor({ state: 'visible', timeout: 10_000 })
    await dismissFeedbackSurvey()
    await publishButton.click()

    // ── Verify the success state ("Your job is live!") ───
    await expect(page.getByRole('heading', { name: 'Your job is live!' })).toBeVisible({ timeout: 20_000 })

    // ── Extract job slug from the application link ────────
    const applicationLink = await page.locator('input[readonly]').inputValue()
    expect(applicationLink).toMatch(/\/jobs\/[^/]+\/apply(?:$|[?#])/)
    const slugMatch = applicationLink.match(/\/jobs\/([^/]+)\/apply(?:$|[?#])/)
    const jobSlug = slugMatch?.[1] ?? ''
    expect(jobSlug.length, 'Job slug must not be empty').toBeGreaterThan(0)

    // ── Verify on public jobs page ───────────────────────
    await page.goto(`/jobs/${jobSlug}`)
    await expect(page.getByRole('heading', { name: JOB_TITLE })).toBeVisible()
    await expect(page.getByText(JOB_LOCATION)).toBeVisible()

    // Verify the "Apply" link/button is present (use .first() because the page has two apply links)
    await expect(page.getByRole('link', { name: /apply/i }).first()).toBeVisible()

    // The published candidate form must match the builder configuration.
    await page.goto(`/jobs/${jobSlug}/apply`)
    await expect(page.getByLabel('Cover Letter')).toBeVisible()
    await expect(page.getByText('Resume / CV', { exact: false })).toHaveCount(0)
    const publishedQuestion = page.getByLabel(UPDATED_QUESTION_LABEL)
    await expect(publishedQuestion).toBeVisible()
    await expect(publishedQuestion.getByRole('option', { name: 'Playwright' })).toHaveCount(1)
    await expect(publishedQuestion.getByRole('option', { name: 'Cypress' })).toHaveCount(1)
  })
})
