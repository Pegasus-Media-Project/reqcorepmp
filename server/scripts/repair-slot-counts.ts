/**
 * Repairs slot-booking state left stale by interviews that were cancelled or
 * deleted before seat release existed, in two passes:
 *
 * 1. Cancels orphaned confirmed bookings — those whose interview was deleted
 *    (interview_id nulled by the FK) or cancelled. These no longer hold a
 *    seat, and while confirmed they block the candidate from booking again.
 *
 * 2. Recomputes `interview_slot.booked_count` for future slots from what
 *    actually holds a seat:
 *
 *   booked_count = confirmed bookings whose interview is still scheduled
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

/**
 * A seat is genuinely held by: a confirmed booking whose interview still
 * exists and is scheduled, or a scheduled slot-linked interview with no
 * booking row at all (recruiter one-off / reschedule seats).
 */
const actualCountSql = sql`
  (SELECT count(*) FROM interview_slot_booking b
    JOIN interview bi ON bi.id = b.interview_id
    WHERE b.slot_id = s.id AND b.status = 'confirmed' AND bi.status = 'scheduled')
  +
  (SELECT count(*) FROM interview i
    WHERE i.slot_id = s.id AND i.status = 'scheduled'
      AND NOT EXISTS (
        SELECT 1 FROM interview_slot_booking b2 WHERE b2.interview_id = i.id
      ))
`

async function main() {
  // Pass 1: orphaned confirmed bookings (interview deleted or cancelled).
  const orphans = await db.execute(sql`
    SELECT b.id, b.slot_id, b.interview_id
    FROM interview_slot_booking b
    LEFT JOIN interview i ON i.id = b.interview_id
    WHERE b.status = 'confirmed'
      AND (b.interview_id IS NULL OR i.id IS NULL OR i.status = 'cancelled')
  `)
  for (const b of orphans) {
    console.log(`${apply ? 'FIX' : 'DRY-RUN'}: booking ${b.id} on slot ${b.slot_id} is confirmed but its interview is ${b.interview_id ? 'cancelled' : 'deleted'} — marking booking cancelled`)
    if (apply) {
      await db.execute(sql`
        UPDATE interview_slot_booking
        SET status = 'cancelled', updated_at = now()
        WHERE id = ${b.id as string} AND status = 'confirmed'
      `)
    }
  }

  // Pass 2: recount future slots.
  const stale = await db.execute(sql`
    SELECT s.id, s.title, s.starts_at, s.booked_count,
      (${actualCountSql}) AS actual_count
    FROM interview_slot s
    WHERE s.starts_at > now()
      AND s.booked_count <> (${actualCountSql})
    ORDER BY s.starts_at
  `)

  if (!orphans.length && !stale.length) {
    console.log('All bookings and future slot counters are consistent — nothing to do.')
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
    ? `Repaired ${orphans.length} orphaned booking(s) and ${stale.length} slot counter(s).`
    : `${orphans.length} orphaned booking(s) and ${stale.length} slot counter(s) would be repaired. Re-run with --apply to fix.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => client.end())
