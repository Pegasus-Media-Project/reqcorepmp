import { defineTask } from 'nitropack/runtime/task'

/**
 * Hourly storage-auth probe. Storage credentials are injected at deploy time,
 * so a rotation at the provider silently breaks the running process: every
 * resume upload fails (and the application rolls back) while the rest of the
 * app looks healthy. This surfaces that state as a loud, greppable error
 * (`s3.storage_auth_failed`) instead of waiting for an applicant to hit it.
 */
export default defineTask({
  meta: {
    name: 'storage-health',
    description: 'Verify S3 storage credentials still authenticate; log loudly if not',
  },
  async run() {
    const health = await checkStorageHealth()
    if (health.ok) {
      logInfo('s3.storage_health_ok', { bucket: env.S3_BUCKET })
    } else {
      console.error(`[Reqcore] STORAGE AUTH FAILED for bucket "${env.S3_BUCKET}" — uploads are failing; fix credentials and redeploy: ${health.error}`)
      logError('s3.storage_auth_failed', { bucket: env.S3_BUCKET, error_message: health.error, phase: 'scheduled_task' })
      await alertStorageAuthFailure({ error: health.error, phase: 'scheduled_task' })
    }
    return { result: health }
  },
})
