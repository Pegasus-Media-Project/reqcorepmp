import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Deleting one application leans on the database to take its dependents with
 * it. These tests guard that arrangement: if a new table starts referencing an
 * application without a cascade, or a polymorphic link is added, the delete
 * would silently start leaving orphans behind.
 */
const schemaSource = readFileSync(resolve(__dirname, '../../server/database/schema/app.ts'), 'utf8')
const handlerSource = readFileSync(resolve(__dirname, '../../server/api/applications/[id].delete.ts'), 'utf8')

describe('application delete', () => {
  it('cascades every foreign key that points at an application', () => {
    const references = [...schemaSource.matchAll(/references\(\(\) => application\.id[^)]*\)/g)]
      .map(match => match[0])

    // Sanity: the tables we know about (answers, interviews, reviews, bookings,
    // source attribution, criterion scores, analysis runs).
    expect(references.length).toBeGreaterThanOrEqual(7)

    const withoutCascade = references.filter(ref => !ref.includes("onDelete: 'cascade'"))
    expect(withoutCascade).toEqual([])
  })

  it('clears the two links the database can’t cascade', () => {
    // Comments and property values point at applications by id without a
    // foreign key, so nothing removes them automatically.
    expect(schemaSource).toContain("targetType: commentTargetEnum('target_type')")
    expect(schemaSource).toContain("entityType: propertyEntityTypeEnum('entity_type')")

    expect(handlerSource).toContain('delete(comment)')
    expect(handlerSource).toContain('delete(propertyValue)')
    expect(handlerSource).toContain("eq(comment.targetType, 'application')")
    expect(handlerSource).toContain("eq(propertyValue.entityType, 'application')")
  })

  it('leaves the candidate and their documents alone', () => {
    // Documents hang off the candidate, not the application — another
    // application may rely on the same resume.
    expect(schemaSource).toMatch(/candidateId: text\('candidate_id'\)\.notNull\(\)\.references\(\(\) => candidate\.id/)
    expect(handlerSource).not.toContain('delete(candidate)')
    expect(handlerSource).not.toContain('delete(document)')
  })

  it('is owner/admin only and scoped to the caller’s jobs', () => {
    expect(handlerSource).toContain("requirePermission(event, { application: ['delete'] })")
    expect(handlerSource).toContain('assertApplicationInScope(session, id)')
    // Every statement is also constrained to the active organization.
    expect(handlerSource).toContain('eq(application.organizationId, orgId)')
  })

  it('writes the audit entry before the row is gone', () => {
    const activityAt = handlerSource.indexOf('recordActivity')
    const deleteAt = handlerSource.indexOf('db.transaction')
    expect(activityAt).toBeGreaterThan(-1)
    expect(deleteAt).toBeGreaterThan(activityAt)
    // The trail keeps enough to identify what was removed.
    expect(handlerSource).toContain('candidateEmail')
    expect(handlerSource).toContain('jobTitle')
  })
})
