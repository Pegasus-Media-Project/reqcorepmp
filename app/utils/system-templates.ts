export { SYSTEM_TEMPLATES } from '~~/shared/system-templates'
export type { SystemTemplate, SystemTemplateType } from '~~/shared/system-templates'

export const AVAILABLE_VARIABLES = [
  { key: '{{candidateName}}', desc: 'Full name' },
  { key: '{{candidateFirstName}}', desc: 'First name' },
  { key: '{{candidateLastName}}', desc: 'Last name' },
  { key: '{{candidateEmail}}', desc: 'Email address' },
  { key: '{{jobTitle}}', desc: 'Job title' },
  { key: '{{interviewTitle}}', desc: 'Interview title' },
  { key: '{{interviewDate}}', desc: 'Interview date' },
  { key: '{{interviewTime}}', desc: 'Interview time' },
  { key: '{{interviewDuration}}', desc: 'Duration (min)' },
  { key: '{{interviewType}}', desc: 'Interview type' },
  { key: '{{interviewLocation}}', desc: 'Location/link' },
  { key: '{{interviewers}}', desc: 'Interviewer names' },
  { key: '{{organizationName}}', desc: 'Your org name' },
  { key: '{{statusUrl}}', desc: 'Application status link' },
  { key: '{{actionUrl}}', desc: 'Next-step action link (sign/pay)' },
  { key: '{{bookingUrl}}', desc: 'Self-schedule booking link' },
  { key: '{{expiresAt}}', desc: 'Booking link expiry date' },
] as const

/** Human-friendly labels for each lifecycle template type. */
export const EMAIL_TEMPLATE_TYPE_LABELS: Record<string, string> = {
  interview_invitation: 'Interview invitation',
  application_accepted: 'Acceptance letter',
  application_rejected: 'Rejection letter',
  fee_verified: 'Application fee verified',
  documents_verified: 'Documents verified',
  self_schedule_invitation: 'Self-schedule invitation',
}

export function renderTemplatePreview(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key]! : match
  })
}
