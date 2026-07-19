/** Lifecycle event a template applies to (mirrors emailTemplateTypeEnum). */
export type SystemTemplateType =
  | 'interview_invitation'
  | 'application_accepted'
  | 'application_rejected'
  | 'fee_verified'
  | 'documents_verified'
  | 'self_schedule_invitation'

export interface SystemTemplate {
  id: string
  /** Which lifecycle event this template is a default for. */
  type: SystemTemplateType
  name: string
  description: string
  subject: string
  body: string
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'system-standard',
    type: 'interview_invitation',
    name: 'Standard Interview Invitation',
    description: 'A professional and formal invitation suitable for most interview types.',
    subject: 'Interview Invitation: {{jobTitle}} at {{organizationName}}',
    body: `Dear {{candidateName}},

We are pleased to invite you to an interview for the {{jobTitle}} position at {{organizationName}}.

Interview Details:
- Date: {{interviewDate}}
- Time: {{interviewTime}}
- Duration: {{interviewDuration}} minutes
- Type: {{interviewType}}
- Location: {{interviewLocation}}

Interviewers: {{interviewers}}

Please confirm your availability by replying to this email. If you need to reschedule, let us know as soon as possible.

We look forward to speaking with you!

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-friendly',
    type: 'interview_invitation',
    name: 'Friendly & Casual',
    description: 'A warm, conversational tone that puts candidates at ease.',
    subject: "Let's chat! Interview for {{jobTitle}}",
    body: `Hi {{candidateFirstName}},

Great news — we'd love to meet you for the {{jobTitle}} role at {{organizationName}}!

Here are the details:
- When: {{interviewDate}} at {{interviewTime}} ({{interviewDuration}} min)
- How: {{interviewType}}
- Where: {{interviewLocation}}

You'll be speaking with: {{interviewers}}

If this time doesn't work for you, just let us know and we'll find something that does.

Looking forward to it!

The {{organizationName}} Team`,
  },
  {
    id: 'system-technical',
    type: 'interview_invitation',
    name: 'Technical Interview',
    description: 'Tailored for technical interviews with preparation tips for candidates.',
    subject: 'Technical Interview: {{jobTitle}} — {{organizationName}}',
    body: `Dear {{candidateName}},

Thank you for your interest in the {{jobTitle}} position at {{organizationName}}. We'd like to invite you to a technical interview.

Interview Details:
- Title: {{interviewTitle}}
- Date: {{interviewDate}}
- Time: {{interviewTime}}
- Duration: {{interviewDuration}} minutes
- Format: {{interviewType}}
- Location: {{interviewLocation}}

Your interviewer(s): {{interviewers}}

To help you prepare:
- Be ready to discuss your technical experience and problem-solving approach
- You may be asked to write or review code during the session
- Feel free to ask questions about our tech stack and development practices

Please confirm your attendance by replying to this email.

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-application-accepted',
    type: 'application_accepted',
    name: 'Acceptance Letter',
    description: 'Sent when an applicant is moved to the offer stage. Links to their next steps.',
    subject: "Congratulations — you've been accepted for {{jobTitle}}",
    body: `Dear {{candidateFirstName}},

Congratulations! We're delighted to offer you a place for the {{jobTitle}} position at {{organizationName}}.

As a next step, please review and sign the required documents. Your electronic signature is legally binding.

Sign your documents here: {{actionUrl}}

You can track the status of your application and remaining steps at any time here: {{statusUrl}}

A member of our team will manually confirm each step once it's complete.

Warm regards,
{{organizationName}}`,
  },
  {
    id: 'system-application-rejected',
    type: 'application_rejected',
    name: 'Rejection Letter',
    description: 'Sent when an application is not moving forward.',
    subject: 'Update on your application for {{jobTitle}}',
    body: `Dear {{candidateFirstName}},

Thank you for your interest in the {{jobTitle}} position at {{organizationName}} and for the time you invested in your application.

After careful consideration, we've decided not to move forward with your application at this time. This decision was not easy, and we encourage you to apply for future opportunities that match your experience.

We wish you the very best in your search.

Sincerely,
{{organizationName}}`,
  },
  {
    id: 'system-fee-verified',
    type: 'fee_verified',
    name: 'Application Fee Verified',
    description: 'Sent when staff confirm the application fee has been paid.',
    subject: 'Your application fee has been confirmed — {{jobTitle}}',
    body: `Dear {{candidateFirstName}},

Good news — we've confirmed your application fee for the {{jobTitle}} position at {{organizationName}}. No further action is needed for this step.

You can check your application status here: {{statusUrl}}

Thank you,
{{organizationName}}`,
  },
  {
    id: 'system-documents-verified',
    type: 'documents_verified',
    name: 'Documents Verified',
    description: 'Sent when staff confirm the signed documents have been received.',
    subject: 'Your signed documents have been received — {{jobTitle}}',
    body: `Dear {{candidateFirstName}},

We've confirmed receipt of your signed documents for the {{jobTitle}} position at {{organizationName}}. Thank you for completing this step.

You can check your application status here: {{statusUrl}}

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-self-schedule',
    type: 'self_schedule_invitation',
    name: 'Self-Schedule Invitation',
    description: 'Invites the candidate to pick their own interview time via a private booking link.',
    subject: 'Schedule your interview for {{jobTitle}}',
    body: `Hi {{candidateFirstName}},

We'd like to invite you to interview for {{jobTitle}} at {{organizationName}}.

Please pick a time that works for you using the link below:
{{bookingUrl}}

This link expires on {{expiresAt}}.

We look forward to speaking with you.

{{organizationName}}`,
  },
]
