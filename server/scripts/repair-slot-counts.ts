/**
 * Recomputes `interview_slot.booked_count` for future slots from what actually
 * holds a seat, repairing counters left stale by interviews that were
 * cancelled or deleted before seat release existed:
 *
 *   booked_count = confirmed bookings on the slot
 *                + scheduled interviews linked to the slot that have no
 *                  booking row (recruiter-scheduled one-off/reschedule seats)
 *
 * Default is a dry-run:
 *   npx tsx server/scripts/repair-slot-counts.ts
 *
 * Apply:
 *   npx tsx server/scripts/repair-slot-counts.ts --apply
 *
 * Requires DATABASE_URL in .env or shell environment.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '../database/schema'

const processWithLoadEnv = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void
}
if (typeof processWithLoadEnv.loadEnvFile === 'function') {
  try { processWithLoadEnv.loadEnvFile('.env') } catch {}
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('ERROR: DATABASE_URL is not set')
  process.exit(1)
}

const apply = process.argv.includes('--apply')

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client, { schema })

async function main() {
  const stale = await db.execute(sql`
    SELECT s.id, s.title, s.starts_at, s.booked_count,
      (
        (SELECT count(*) FROM interview_slot_booking b
          WHERE b.slot_id = s.id AND b.status = 'confirmed')
        +
        (SELECT count(*) FROM interview i
          WHERE i.slot_id = s.id AND i.status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1 FROM interview_slot_booking b2 WHERE b2.interview_id = i.id
            ))
      ) AS actual_count
    FROM interview_slot s
    WHERE s.starts_at > now()
      AND s.booked_count <> (
        (SELECT count(*) FROM interview_slot_booking b
          WHERE b.slot_id = s.id AND b.status = 'confirmed')
        +
        (SELECT count(*) FROM interview i
          WHERE i.slot_id = s.id AND i.status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1 FROM interview_slot_booking b2 WHERE b2.interview_id = i.id
            ))
      )
    ORDER BY s.starts_at
  `)

  if (!stale.length) {
    console.log('All future slot counters are consistent — nothing to do.')
    return
  }

  for (const row of stale) {
    console.log(`${apply ? 'FIX' : 'DRY-RUN'}: "${row.title}" @ ${new Date(row.starts_at as string).toISOString()} — booked_count ${row.booked_count} → ${row.actual_count} (slot ${row.id})`)
    if (apply) {
      await db.execute(sql`
        UPDATE interview_slot
        SET booked_count = ${Number(row.actual_count)}, updated_at = now()
        WHERE id = ${row.id as string}
      `)
    }
  }

  console.log(apply
    ? `Repaired ${stale.length} slot(s).`
    : `${stale.length} slot(s) would be repaired. Re-run with --apply to fix.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => client.end())
