import { and, eq, gt, inArray } from 'drizzle-orm'
import {
  interviewSlot, interviewSlotSignup, reviewerSlotAvailability, job,
} from '../../database/schema'
import { user } from '../../database/schema/auth'
import { reviewerSlotsQuerySchema } from '../../utils/schemas/interviewSlot'

/**
 * GET /api/reviewer/interview-slots?jobId=…
 *
 * The reviewer signup view: every upcoming interview slot of the caller's
 * in-scope jobs (guests and members see only their assigned jobs; owner/admin
 * see all), including slots no candidate has booked yet, with who has signed
 * up to interview and the caller's own signup + availability state.
 * Read-only-safe: guests hold `interview: read` and this exposes no candidate
 * data — just times, capacity and interviewer names.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { jobId } = await getValidatedQuery(event, reviewerSlotsQuerySchema.parse)

  const scope = await getManagedJobScope(session)
  if (jobId) {
    if (!scope.manageAll && !scope.jobIds.includes(jobId)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }
  else if (!scope.manageAll && scope.jobIds.length === 0) {
    return { jobs: [], slots: [], availability: [] }
  }

  const jobCondition = jobId
    ? eq(interviewSlot.jobId, jobId)
    : jobScopeCondition(scope, interviewSlot.jobId)

  const slots = await db.select({
    id: interviewSlot.id,
    jobId: interviewSlot.jobId,
    jobTitle: job.title,
    title: interviewSlot.title,
    type: interviewSlot.type,
    startsAt: interviewSlot.startsAt,
    duration: interviewSlot.duration,
    timezone: interviewSlot.timezone,
    location: interviewSlot.location,
    interviewers: interviewSlot.interviewers,
    capacity: interviewSlot.capacity,
    bookedCount: interviewSlot.bookedCount,
    status: interviewSlot.status,
  })
    .from(interviewSlot)
    .innerJoin(job, eq(interviewSlot.jobId, job.id))
    .where(and(
      eq(interviewSlot.organizationId, orgId),
      inArray(interviewSlot.status, ['open', 'closed']),
      gt(interviewSlot.startsAt, new Date()),
      jobCondition,
    ))
    .orderBy(interviewSlot.startsAt)

  // Signups for the listed slots, with reviewer display names.
  const slotIds = slots.map(s => s.id)
  const signups = slotIds.length
    ? await db.select({
        slotId: interviewSlotSignup.slotId,
        userId: interviewSlotSignup.userId,
        source: interviewSlotSignup.source,
        name: user.name,
      })
        .from(interviewSlotSignup)
        .innerJoin(user, eq(interviewSlotSignup.userId, user.id))
        .where(and(
          eq(interviewSlotSignup.organizationId, orgId),
          inArray(interviewSlotSignup.slotId, slotIds),
        ))
        .orderBy(interviewSlotSignup.createdAt)
    : []
  const signupsBySlot = new Map<string, typeof signups>()
  for (const s of signups) {
    const list = signupsBySlot.get(s.slotId) ?? []
    list.push(s)
    signupsBySlot.set(s.slotId, list)
  }

  // The caller's availability ranges (all their in-scope jobs, or the one job).
  const myAvailability = await db.query.reviewerSlotAvailability.findMany({
    where: and(
      eq(reviewerSlotAvailability.organizationId, orgId),
      eq(reviewerSlotAvailability.userId, session.user.id),
      ...(jobId ? [eq(reviewerSlotAvailability.jobId, jobId)] : []),
    ),
    orderBy: (a, { asc }) => [asc(a.startsAt)],
  })

  // Jobs the caller may sign up for: every in-scope, non-archived job (not
  // just those with slots, so availability can be declared ahead of slots).
  const scopedJobs = await db.select({ id: job.id, title: job.title })
    .from(job)
    .where(and(
      eq(job.organizationId, orgId),
      inArray(job.status, ['open', 'closed']),
      jobScopeCondition(scope, job.id),
    ))
    .orderBy(job.title)
  const jobsById = new Map<string, { id: string, title: string }>()
  for (const j of scopedJobs) jobsById.set(j.id, j)
  for (const s of slots) jobsById.set(s.jobId, { id: s.jobId, title: s.jobTitle })

  return {
    jobs: [...jobsById.values()],
    slots: slots.map((s) => {
      const slotSignups = signupsBySlot.get(s.id) ?? []
      const mine = slotSignups.find(x => x.userId === session.user.id)
      return {
        ...s,
        available: Math.max(0, s.capacity - s.bookedCount),
        reviewers: slotSignups.map(x => ({ userId: x.userId, name: x.name, source: x.source })),
        manualInterviewers: s.interviewers ?? [],
        interviewers: undefined,
        signedUp: !!mine,
        signupSource: mine?.source ?? null,
      }
    }),
    availability: myAvailability.map(a => ({
      id: a.id,
      jobId: a.jobId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
    })),
  }
})
