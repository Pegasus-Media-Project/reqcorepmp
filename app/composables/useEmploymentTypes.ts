/**
 * Org-configurable employment types for the active organization.
 * Thin wrapper over the /api/employment-types CRUD routes. The job form's
 * employment-type picker is populated from this list; a job stores the chosen
 * label directly.
 */
export interface EmploymentType {
  id: string
  organizationId: string
  label: string
  displayOrder: number
  createdAt: string | Date
  updatedAt: string | Date
}

export interface EmploymentTypeInput {
  label: string
  displayOrder?: number
}

export function useEmploymentTypes() {
  const { data: employmentTypes, refresh, status } = useFetch<EmploymentType[]>('/api/employment-types', {
    key: 'employment-types',
    headers: useRequestHeaders(['cookie']),
    default: () => [],
  })

  async function createEmploymentType(body: EmploymentTypeInput) {
    return await $fetch<EmploymentType>('/api/employment-types', { method: 'POST', body })
  }

  async function updateEmploymentType(id: string, body: Partial<EmploymentTypeInput>) {
    return await $fetch<EmploymentType>(`/api/employment-types/${id}`, { method: 'PATCH', body })
  }

  async function deleteEmploymentType(id: string) {
    return await $fetch(`/api/employment-types/${id}`, { method: 'DELETE' })
  }

  return { employmentTypes, refresh, status, createEmploymentType, updateEmploymentType, deleteEmploymentType }
}
