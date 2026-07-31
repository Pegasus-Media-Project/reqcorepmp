export type EmailTemplateType =
  | 'interview_invitation'
  | 'application_accepted'
  | 'application_rejected'
  | 'fee_verified'
  | 'fee_waived'
  | 'documents_verified'
  | 'self_schedule_invitation'

export interface EmailTemplate {
  id: string
  templateType: EmailTemplateType
  name: string
  subject: string
  body: string
  organizationId: string
  createdById: string
  createdAt: string
  updatedAt: string
}

/**
 * Composable for managing email templates (CRUD + system templates).
 */
export function useEmailTemplates() {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const { data: templates, status, error, refresh } = useFetch<EmailTemplate[]>('/api/email-templates', {
    key: 'email-templates',
    headers: useRequestHeaders(['cookie']),
    default: () => [],
  })

  async function createTemplate(payload: {
    templateType?: EmailTemplateType
    name: string
    subject: string
    body: string
  }) {
    try {
      const created = await $fetch('/api/email-templates', {
        method: 'POST',
        body: payload,
      })
      await refresh()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function updateTemplate(id: string, payload: Partial<{
    templateType: EmailTemplateType
    name: string
    subject: string
    body: string
  }>) {
    try {
      const updated = await $fetch(`/api/email-templates/${id}`, {
        method: 'PATCH',
        body: payload,
      })
      await refresh()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function deleteTemplate(id: string) {
    try {
      await $fetch(`/api/email-templates/${id}`, {
        method: 'DELETE',
      })
      await refresh()
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  async function sendInvitation(interviewId: string, payload: {
    templateId?: string
    customSubject?: string
    customBody?: string
  }) {
    try {
      return await $fetch(`/api/interviews/${interviewId}/send-invitation`, {
        method: 'POST',
        body: payload,
      })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  return { templates, status, error, refresh, createTemplate, updateTemplate, deleteTemplate, sendInvitation }
}
