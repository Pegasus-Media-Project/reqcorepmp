# Data Retention & GDPR

Reqcore ships a free data-retention and erasure foundation for both hosted and
self-hosted deployments. No paid plan, license key, or quota gates any of it.

> **Scope.** These tools help you operate a GDPR-aligned retention process; they
> do not by themselves make a deployment "GDPR-compliant." Compliance also
> depends on your lawful basis, privacy notices, processor agreements (incl. any
> AI providers), backup handling, and — for automated candidate scoring — a
> possible DPIA. Treat this as engineering support, not legal advice.

## What it does

- **Retention policy** (per organization): automatically delete candidate data a
  configurable number of months (default **24**) after the end of the candidate's
  **latest recruitment process** — not their upload date.
- **Quarantine window**: expired candidates first enter a recoverable quarantine
  (default **30 days**) before permanent erasure, protecting against mistakes.
- **Erasure**: a single erasure service removes the candidate's data graph in the
  live system — DB records, applications, documents, **S3 objects**, AI results,
  interviews, responses, custom properties, comments, and activity-log entries.
  Manual deletion and automated retention use the **same** path, so they produce
  identical results. (Backups are handled separately — see below.)
- **Exemptions / legal holds**: candidates can be placed on a documented legal
  hold (future expiry + required reason) that suppresses automated erasure *and*
  blocks manual deletion. Manual deletion of a held candidate requires an explicit
  `override=true` to lift the hold. Restoring a candidate from quarantine resets
  its retention clock, so it is not immediately re-quarantined on the next sweep.
- **Data-subject support**: per-candidate JSON export (Art. 15 / 20) covering the
  candidate, applications, responses, interviews, scores, AI analysis runs,
  comments, custom properties, and activity log; uploaded-file *contents* are
  retrieved via their individual download links. Corrections are made via the
  normal candidate edit screens.
- **Privacy notice**: an org-configurable notice shown on the public application
  form, with policy URL and contact email.
- **Privacy-safe audit**: every retention action writes a `retention_audit` row
  containing **no** names, emails, filenames, resume content, or storage keys.

Configure it under **Settings → Privacy & Retention**.

## How retention is calculated

```
expiry = (latest application activity OR candidate creation) + retentionMonths
```

floored so that nothing expires until at least 30 days after an org first enables
retention. This gives admins a review window — existing data is **never** deleted
immediately on enabling the feature. Expiry is derived on each cron run (not
stored), so it self-heals when a candidate gets a new application or status change.

## Running the cleanup job

Erasure runs through an authenticated endpoint:

```
POST /api/admin/retention-cleanup
Header: x-cron-secret: <CRON_SECRET>
Body (optional): { "dryRun": true, "batchSize": 200 }
```

Set the `CRON_SECRET` environment variable (min 16 chars). The same endpoint can
be triggered interactively by an owner/admin (candidate:delete permission).

- **Dry run**: `{ "dryRun": true }` reports what would be quarantined/erased and
  mutates nothing.
- **Idempotent**: safe to run repeatedly. If an S3 object fails to delete, the
  candidate is left intact and retried on the next run (the storage key is never
  lost).

### Hosted (Railway)

Schedule a daily cron that POSTs to `/api/admin/retention-cleanup` with the
`x-cron-secret` header.

### Self-hosted

Point any scheduler (system `cron`, a CI scheduler, an uptime monitor, etc.) at
the endpoint once a day. Example crontab entry:

```cron
0 3 * * * curl -fsS -X POST https://your-host/api/admin/retention-cleanup \
  -H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json" -d '{}'
```

## Backups

Erasure removes live database rows and S3 objects immediately. Backups expire on
their normal rotation schedule rather than being purged on demand (the standard
GDPR posture). **After restoring any backup, re-run the cleanup job** so that
candidates past their purge date are erased again and not silently resurrected.

## Controller / processor split

The organization is the **data controller**. For data-subject access, erasure, or
correction requests, the org is responsible for verifying the requester's identity
before acting, then using the admin tools (export / erase / edit). Reqcore does
not expose a candidate-facing self-service portal.
