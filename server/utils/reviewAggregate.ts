import { and, asc, eq, inArray } from 'drizzle-orm'
import { application, candidate, interview, job, review, user } from '../database/schema'

export interface ReviewerRow {
  reviewerId: string
  reviewerName: string | null
  reviewerEmail: string
  stage: 'screening' | 'interview'
  rating: number | null
  notes: string | null
  updatedAt: Date
}

export interface ApplicantAggregate {
  applicationId: string
  candidateName: string
  firstName: string
  lastName: string
  candidateEmail: string
  status: string
  /** Next upcoming interview, else the most recent one; null if none. */
  nextInterviewAt: Date | null
  screeningAvg: number | null
  screeningCount: number
  interviewAvg: number | null
  interviewCount: number
  overallAvg: number | null
  reviewCount: number
  reviews: ReviewerRow[]
}

/** How far each reviewer has progressed through the job's applicants. */
export interface ReviewerProgress {
  id: string
  name: string | null
  email: string
  /** Distinct applicants this reviewer has scored/noted at each stage. */
  screeningCount: number
  interviewCount: number
  /** Total applicants on the job (the denominator). */
  totalApplicants: number
}

export interface JobReviewAggregate {
  jobTitle: string
  applicants: ApplicantAggregate[]
  reviewers: { id: string, name: string | null, email: string }[]
  reviewerProgress: ReviewerProgress[]
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

/**
 * Build the per-applicant review aggregate for a job: average screening score,
 * average interview score, counts, the full per-reviewer breakdown, each
 * applicant's next/last interview time, and per-reviewer progress. Every
 * applicant for the job is included (even with no reviews yet). Shared by the
 * ratings tab, the global ratings page, and the CSV/XLSX export.
 *
 * Caller is responsible for permission + job-scope checks.
 */
export async function buildJobReviewAggregate(orgId: string, jobId: string): Promise<JobReviewAggregate> {
  const [jobRow, apps, reviewRows] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { title: true },
    }),
    db
      .select({
        applicationId: application.id,
        status: application.status,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        displayName: candidate.displayName,
        email: candidate.email,
        createdAt: application.createdAt,
      })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))
      .orderBy(asc(application.createdAt)),
    db
      .select({
        applicationId: review.applicationId,
        stage: review.stage,
        rating: review.rating,
        notes: review.notes,
        updatedAt: review.updatedAt,
        reviewerId: review.reviewerId,
        reviewerName: user.name,
        reviewerEmail: user.email,
      })
      .from(review)
      .innerJoin(user, eq(user.id, review.reviewerId))
      .where(and(eq(review.organizationId, orgId), eq(review.jobId, jobId))),
  ])

  const appIds = apps.map(a => a.applicationId)

  // Interviews for these applications → each applicant's next/last scheduled time.
  const interviewRows = appIds.length > 0
    ? await db
        .select({ applicationId: interview.applicationId, scheduledAt: interview.scheduledAt })
        .from(interview)
        .where(and(eq(interview.organizationId, orgId), inArray(interview.applicationId, appIds)))
    : []
  const now = new Date()
  const nextInterviewByApp = new Map<string, Date>()
  for (const iv of interviewRows) {
    const existing = nextInterviewByApp.get(iv.applicationId)
    if (!existing) {
      nextInterviewByApp.set(iv.applicationId, iv.scheduledAt)
      continue
    }
    // Prefer the soonest upcoming interview; otherwise keep the latest one.
    const existingUpcoming = existing >= now
    const candidateUpcoming = iv.scheduledAt >= now
    if (candidateUpcoming && (!existingUpcoming || iv.scheduledAt < existing)) {
      nextInterviewByApp.set(iv.applicationId, iv.scheduledAt)
    }
    else if (!existingUpcoming && !candidateUpcoming && iv.scheduledAt > existing) {
      nextInterviewByApp.set(iv.applicationId, iv.scheduledAt)
    }
  }

  const reviewsByApp = new Map<string, ReviewerRow[]>()
  const reviewerMap = new Map<string, { id: string, name: string | null, email: string }>()
  // Per-reviewer distinct applications rated, by stage.
  const progress = new Map<string, { name: string | null, email: string, screening: Set<string>, interview: Set<string> }>()
  for (const r of reviewRows) {
    const list = reviewsByApp.get(r.applicationId) ?? []
    list.push({
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerName,
      reviewerEmail: r.reviewerEmail,
      stage: r.stage,
      rating: r.rating,
      notes: r.notes,
      updatedAt: r.updatedAt,
    })
    reviewsByApp.set(r.applicationId, list)
    if (!reviewerMap.has(r.reviewerId)) {
      reviewerMap.set(r.reviewerId, { id: r.reviewerId, name: r.reviewerName, email: r.reviewerEmail })
    }
    const p = progress.get(r.reviewerId) ?? { name: r.reviewerName, email: r.reviewerEmail, screening: new Set<string>(), interview: new Set<string>() }
    p[r.stage].add(r.applicationId)
    progress.set(r.reviewerId, p)
  }

  const applicants: ApplicantAggregate[] = apps.map((a) => {
    const rs = reviewsByApp.get(a.applicationId) ?? []
    const screeningScores = rs.filter(r => r.stage === 'screening' && r.rating != null).map(r => r.rating!)
    const interviewScores = rs.filter(r => r.stage === 'interview' && r.rating != null).map(r => r.rating!)
    const allScores = [...screeningScores, ...interviewScores]
    return {
      applicationId: a.applicationId,
      candidateName: (a.displayName ?? `${a.firstName} ${a.lastName}`).trim(),
      firstName: a.firstName,
      lastName: a.lastName,
      candidateEmail: a.email,
      status: a.status,
      nextInterviewAt: nextInterviewByApp.get(a.applicationId) ?? null,
      screeningAvg: avg(screeningScores),
      screeningCount: screeningScores.length,
      interviewAvg: avg(interviewScores),
      interviewCount: interviewScores.length,
      overallAvg: avg(allScores),
      reviewCount: rs.length,
      reviews: rs,
    }
  })

  const reviewerProgress: ReviewerProgress[] = [...progress.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    email: p.email,
    screeningCount: p.screening.size,
    interviewCount: p.interview.size,
    totalApplicants: apps.length,
  }))

  return {
    jobTitle: jobRow?.title ?? 'job',
    applicants,
    reviewers: [...reviewerMap.values()],
    reviewerProgress,
  }
}
