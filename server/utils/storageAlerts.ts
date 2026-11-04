/**
 * Email alerting for storage-auth failures, throttled so an outage produces
 * one alert every few hours instead of one per hourly probe. In-memory state:
 * a process restart may re-alert sooner, which is acceptable (a restart with
 * bad credentials is itself worth hearing about).
 */

const ALERT_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

let lastAlertAt = 0

/**
 * Send a throttled admin alert about a storage-auth failure.
 * Logging happens at the call sites; this only handles the email.
 */
export async function alertStorageAuthFailure(params: {
  error: string | undefined
  phase: 'startup' | 'scheduled_task'
}): Promise<void> {
  const now = Date.now()
  if (now - lastAlertAt < ALERT_INTERVAL_MS) return
  lastAlertAt = now

  await sendAdminAlertEmail({
    subject: `Storage auth failed — uploads are failing (${params.phase})`,
    text: [
      `The S3 storage credentials this deployment is running with no longer authenticate.`,
      ``,
      `Bucket: ${env.S3_BUCKET}`,
      `Detected: ${params.phase === 'startup' ? 'at app startup' : 'by the hourly storage-health probe'}`,
      `Error: ${params.error ?? 'unknown'}`,
      ``,
      `Impact: resume uploads fail and affected applications are rolled back.`,
      `Fix: verify the storage credentials in the service variables, then redeploy`,
      `the service so the running process picks them up.`,
    ].join('\n'),
  })
}
