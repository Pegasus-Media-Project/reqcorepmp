/**
 * Programs (e.g. Pegasus cohorts) for the active organization.
 * Thin wrapper over the /api/programs CRUD routes.
 */
export interface Program {
  id: string
  organizationId: string
  name: string
  description: string | null
  archived: boolean
  createdAt: string | Date
  updatedAt: string | Date
  jobCount: number
}

export interface ProgramInput {
  name: string
  description?: string | null
  archived?: boolean
}

export function usePrograms() {
  const { data: programs, refresh, status } = useFetch<Program[]>('/api/programs', {
    key: 'programs',
    headers: useRequestHeaders(['cookie']),
    default: () => [],
  })

  async function createProgram(body: ProgramInput) {
    return await $fetch<Program>('/api/programs', { method: 'POST', body })
  }

  async function updateProgram(id: string, body: Partial<ProgramInput>) {
    return await $fetch<Program>(`/api/programs/${id}`, { method: 'PATCH', body })
  }

  async function deleteProgram(id: string) {
    return await $fetch(`/api/programs/${id}`, { method: 'DELETE' })
  }

  return { programs, refresh, status, createProgram, updateProgram, deleteProgram }
}
