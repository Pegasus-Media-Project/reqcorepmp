import { and, asc, eq } from 'drizzle-orm'
import { application, candidate, job, review, user } from '../database/schema'

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
  candidateEmail: string
  status: string
  screeningAvg: number | null
  screeningCount: number
  interviewAvg: number | null
  interviewCount: number
  overallAvg: number | null
  reviewCount: number
  reviews: ReviewerRow[]
}

export interface JobReviewAggregate {
  jobTitle: string
  applicants: ApplicantAggregate[]
  reviewers: { id: string, name: string | null, email: string }[]
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

/**
 * Build the per-applicant review aggregate for a job: average screening score,
 * average interview score, counts, and the full per-reviewer breakdown. Every
 * applicant for the job is included (even with no reviews yet). Shared by the
 * ratings-tab endpoint and the CSV/XLSX export so both stay consistent.
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

  const reviewsByApp = new Map<string, ReviewerRow[]>()
  const reviewerMap = new Map<string, { id: string, name: string | null, email: string }>()
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
  }

  const applicants: ApplicantAggregate[] = apps.map((a) => {
    const rs = reviewsByApp.get(a.applicationId) ?? []
    const screeningScores = rs.filter(r => r.stage === 'screening' && r.rating != null).map(r => r.rating!)
    const interviewScores = rs.filter(r => r.stage === 'interview' && r.rating != null).map(r => r.rating!)
    const allScores = [...screeningScores, ...interviewScores]
    return {
      applicationId: a.applicationId,
      candidateName: (a.displayName ?? `${a.firstName} ${a.lastName}`).trim(),
      candidateEmail: a.email,
      status: a.status,
      screeningAvg: avg(screeningScores),
      screeningCount: screeningScores.length,
      interviewAvg: avg(interviewScores),
      interviewCount: interviewScores.length,
      overallAvg: avg(allScores),
      reviewCount: rs.length,
      reviews: rs,
    }
  })

  return {
    jobTitle: jobRow?.title ?? 'job',
    applicants,
    reviewers: [...reviewerMap.values()],
  }
}
