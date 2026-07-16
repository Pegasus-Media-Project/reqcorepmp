import { and, eq, inArray } from 'drizzle-orm'
import { interview, interviewReviewer, member, user, application, candidate, job, organization } from '../../database/schema'
import { assignReviewersSchema } from '../../utils/schemas/interview'
import { addEventAttendees } from '../../utils/google-calendar'
import { generateInterviewICS } from '../../utils/ical'
import { sendReviewerInterviewInvitationEmail, getFromEmail } from '../../utils/email'

interface AssignResult {
  interviewId: string
  userId: string
  status: 'calendar' | 'email' | 'exists' | 'skipped' | 'failed'
}

/**
 * POST /api/interviews/assign-reviewers
 * Assign one or more reviewers (org members or guests) to one or more
 * interviews in a single action, sending each a calendar invite:
 *   - if the interview is Google-Calendar-synced, add them as an attendee
 *     (Google emails the invite);
 *   - otherwise email them an .ics.
 * Managers only (interview:update) — guests are the assignees, not the assigner.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { userIds, interviewIds } = await readValidatedBody(event, assignReviewersSchema.parse)

  // Resolve assignable users: must be members of this org (includes guests).
  const members = await db
    .select({ userId: member.userId, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, orgId), inArray(member.userId, userIds)))
  const userById = new Map(members.map(m => [m.userId, m]))

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { name: true },
  })
  const organizerEmail = getFromEmail().replace(/^.*</, '').replace(/>$/, '')

  const results: AssignResult[] = []

  for (const interviewId of interviewIds) {
    const iv = await db.query.interview.findFirst({
      where: and(eq(interview.id, interviewId), eq(interview.organizationId, orgId)),
    })
    if (!iv) {
      for (const userId of userIds) results.push({ interviewId, userId, status: 'skipped' })
      continue
    }
    // Scope check — 404s if the caller can't manage this interview's job.
    await assertApplicationInScope(session, iv.applicationId)

    const app = await db.query.application.findFirst({
      where: eq(application.id, iv.applicationId),
      with: { candidate: true, job: { columns: { title: true } } },
    })

    const scheduledAt = new Date(iv.scheduledAt)
    const tz = iv.timezone ?? 'UTC'
    const candidateName = app?.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}` : 'Candidate'

    const existingInterviewers = new Set(((iv.interviewers as string[] | null) ?? []).map(e => e.toLowerCase()))
    const emailsToAppend: string[] = []

    for (const userId of userIds) {
      const u = userById.get(userId)
      if (!u) {
        results.push({ interviewId, userId, status: 'skipped' })
        continue
      }

      // Record the assignment (idempotent).
      const [inserted] = await db
        .insert(interviewReviewer)
        .values({ organizationId: orgId, interviewId, userId })
        .onConflictDoNothing()
        .returning({ id: interviewReviewer.id })
      if (!inserted) {
        results.push({ interviewId, userId, status: 'exists' })
        continue
      }

      if (!existingInterviewers.has(u.email.toLowerCase())) {
        emailsToAppend.push(u.email)
        existingInterviewers.add(u.email.toLowerCase())
      }

      let status: AssignResult['status'] = 'email'
      let calendarSynced = false

      if (iv.googleCalendarEventId) {
        const ok = await addEventAttendees(session.user.id, iv.googleCalendarEventId, [u.email])
        if (ok) {
          status = 'calendar'
          calendarSynced = true
        }
      }

      if (!calendarSynced) {
        // Fallback: email the reviewer an .ics they can add themselves.
        const ics = generateInterviewICS({
          interviewId: iv.id,
          summary: `${iv.title} — ${candidateName}`,
          description: [
            `Interview: ${iv.title}`,
            `Position: ${app?.job.title ?? ''}`,
            `Candidate: ${candidateName}`,
            `Type: ${iv.type}`,
            `Duration: ${iv.duration} minutes`,
            ...(iv.location ? [`Location: ${iv.location}`] : []),
          ].join('\n'),
          startTime: scheduledAt,
          durationMinutes: iv.duration,
          location: iv.location,
          organizerName: org?.name ?? 'Reqcore',
          organizerEmail,
          attendeeEmail: u.email,
          attendeeName: u.name ?? u.email,
        })
        try {
          await sendReviewerInterviewInvitationEmail({
            to: u.email,
            reviewerName: u.name,
            interviewTitle: iv.title,
            jobTitle: app?.job.title ?? '',
            candidateName,
            interviewDate: scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz }),
            interviewTime: scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }),
            interviewLocation: iv.location,
            organizationName: org?.name ?? 'Reqcore',
            icsContent: ics,
          })
        }
        catch {
          status = 'failed'
        }
      }

      await db
        .update(interviewReviewer)
        .set({ invitedAt: new Date(), calendarSynced })
        .where(eq(interviewReviewer.id, inserted.id))

      results.push({ interviewId, userId, status })
    }

    // Persist appended interviewer emails on the interview (drives future syncs).
    if (emailsToAppend.length) {
      const merged = [...((iv.interviewers as string[] | null) ?? []), ...emailsToAppend]
      await db.update(interview)
        .set({ interviewers: merged, updatedAt: new Date() })
        .where(and(eq(interview.id, interviewId), eq(interview.organizationId, orgId)))
    }

    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'interview',
      resourceId: interviewId,
      metadata: { action: 'reviewers_assigned', userIds },
    })
  }

  return { results }
})
