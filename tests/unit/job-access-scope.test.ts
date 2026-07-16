/**
 * Unit tests for the job-scope helper (server/utils/jobAccess.ts).
 *
 * The helper relies on the Nitro-auto-imported `db` and `createError` globals,
 * which we stub here so the pure scoping logic can be exercised without a DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getManagedJobScope,
  jobScopeCondition,
  assertJobInScope,
  assertApplicationInScope,
} from '../../server/utils/jobAccess'

const dbMock = {
  query: {
    member: { findFirst: vi.fn() },
    programAssignment: { findMany: vi.fn() },
    jobAssignment: { findMany: vi.fn() },
    job: { findMany: vi.fn() },
    application: { findFirst: vi.fn() },
  },
}

const session = {
  user: { id: 'user-1' },
  session: { activeOrganizationId: 'org-1' },
}

beforeEach(() => {
  vi.stubGlobal('db', dbMock)
  vi.stubGlobal('createError', (e: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(e.statusMessage), e))
  dbMock.query.member.findFirst.mockReset()
  dbMock.query.programAssignment.findMany.mockReset()
  dbMock.query.jobAssignment.findMany.mockReset()
  dbMock.query.job.findMany.mockReset()
  dbMock.query.application.findFirst.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getManagedJobScope', () => {
  it('grants owners access to everything', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'owner' })
    const scope = await getManagedJobScope(session)
    expect(scope).toEqual({ manageAll: true, jobIds: [] })
    // Owners short-circuit — no assignment lookups needed.
    expect(dbMock.query.programAssignment.findMany).not.toHaveBeenCalled()
  })

  it('grants admins access to everything', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'admin' })
    const scope = await getManagedJobScope(session)
    expect(scope.manageAll).toBe(true)
  })

  it('unions program-jobs and directly-assigned jobs for members', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([{ programId: 'prog-1' }])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-direct' }])
    dbMock.query.job.findMany.mockResolvedValue([{ id: 'job-a' }, { id: 'job-b' }])

    const scope = await getManagedJobScope(session)
    expect(scope.manageAll).toBe(false)
    expect([...scope.jobIds].sort()).toEqual(['job-a', 'job-b', 'job-direct'])
  })

  it('gives an unassigned member no jobs', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([])

    const scope = await getManagedJobScope(session)
    expect(scope).toEqual({ manageAll: false, jobIds: [] })
    // No programs → skip the program-jobs lookup entirely.
    expect(dbMock.query.job.findMany).not.toHaveBeenCalled()
  })

  it('treats an unknown role as an unassigned member', async () => {
    dbMock.query.member.findFirst.mockResolvedValue(undefined)
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([])

    const scope = await getManagedJobScope(session)
    expect(scope.manageAll).toBe(false)
  })
})

describe('jobScopeCondition', () => {
  it('returns undefined (no filter) for manage-all scopes', () => {
    expect(jobScopeCondition({ manageAll: true, jobIds: [] }, {} as any)).toBeUndefined()
  })

  it('returns a match-nothing condition for an empty member scope', () => {
    const cond = jobScopeCondition({ manageAll: false, jobIds: [] }, {} as any)
    expect(cond).toBeDefined()
  })

  it('returns a condition when the member has jobs', () => {
    const cond = jobScopeCondition({ manageAll: false, jobIds: ['job-a'] }, { name: 'id' } as any)
    expect(cond).toBeDefined()
  })
})

describe('assertJobInScope', () => {
  it('is a no-op for owners/admins', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'admin' })
    await expect(assertJobInScope(session, 'any-job')).resolves.toBeUndefined()
  })

  it('passes when the job is in the member scope', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-x' }])
    await expect(assertJobInScope(session, 'job-x')).resolves.toBeUndefined()
  })

  it('throws 404 when the job is out of scope', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-x' }])
    await expect(assertJobInScope(session, 'other-job')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('assertApplicationInScope', () => {
  it('is a no-op for owners/admins', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'owner' })
    await expect(assertApplicationInScope(session, 'app-1')).resolves.toBeUndefined()
    expect(dbMock.query.application.findFirst).not.toHaveBeenCalled()
  })

  it("passes when the application's job is in scope", async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-x' }])
    dbMock.query.application.findFirst.mockResolvedValue({ jobId: 'job-x' })
    await expect(assertApplicationInScope(session, 'app-1')).resolves.toBeUndefined()
  })

  it('throws 404 when the application belongs to an out-of-scope job', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-x' }])
    dbMock.query.application.findFirst.mockResolvedValue({ jobId: 'job-y' })
    await expect(assertApplicationInScope(session, 'app-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 404 when the application does not exist in the org', async () => {
    dbMock.query.member.findFirst.mockResolvedValue({ role: 'member' })
    dbMock.query.programAssignment.findMany.mockResolvedValue([])
    dbMock.query.jobAssignment.findMany.mockResolvedValue([{ jobId: 'job-x' }])
    dbMock.query.application.findFirst.mockResolvedValue(undefined)
    await expect(assertApplicationInScope(session, 'missing')).rejects.toMatchObject({ statusCode: 404 })
  })
})
