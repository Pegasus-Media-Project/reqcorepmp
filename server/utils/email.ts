import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { and, eq } from 'drizzle-orm'
import { emailTemplate } from '../database/schema'
import { SYSTEM_TEMPLATES, type SystemTemplateType } from '~~/shared/system-templates'
import { renderEmailMarkdown } from '~~/shared/email-markdown'

// ─── Resend client ────────────────────────────────────────────────────────────

let _resend: Resend | undefined

function getResendClient(): Resend | null {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) return null
  if (!_resend) _resend = new Resend(apiKey)
  return _resend
}

// ─── SMTP transporter ─────────────────────────────────────────────────────────

let _smtp: Transporter | undefined

function getSmtpTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null
  if (!_smtp) {
    _smtp = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    })
  }
  return _smtp
}

/**
 * Returns the configured sender address for the active email provider.
 * SMTP uses SMTP_FROM; Resend uses RESEND_FROM_EMAIL.
 * Exported for use in routes that need the organizer address (e.g. ICS generation).
 */
export function getFromEmail(): string {
  return env.SMTP_HOST ? env.SMTP_FROM : env.RESEND_FROM_EMAIL
}

// ─── Internal unified send helper ────────────────────────────────────────────

interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** Optional .ics binary attachment (calendar invite). */
  icsAttachment?: Buffer
  /** Resend-only metadata tags — silently ignored by SMTP. */
  resendTags?: Array<{ name: string; value: string }>
  /** Message logged to console when no provider is configured (dev fallback). */
  logFallback: string
  /** logError category used on transport failure. */
  errorCategory: string
}

/**
 * Route an outbound email through SMTP (preferred) → Resend → console fallback.
 * Priority: SMTP_HOST set → use SMTP. Else RESEND_API_KEY set → use Resend.
 * Otherwise logs the fallback message and returns (no error thrown).
 * Throws on transport errors so callers can decide whether to swallow them.
 */
async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = getFromEmail()

  // 1. SMTP — takes priority when SMTP_HOST is configured
  const smtp = getSmtpTransporter()
  if (smtp) {
    try {
      await smtp.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.icsAttachment
          ? { attachments: [{ filename: 'interview.ics', content: msg.icsAttachment, contentType: 'text/calendar; method=REQUEST' }] }
          : {}),
      })
    }
    catch (err) {
      logError(msg.errorCategory, {
        provider: 'smtp',
        error_message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    return
  }

  // 2. Resend
  const resend = getResendClient()
  if (resend) {
    const resendAttachments = msg.icsAttachment
      ? [{ filename: 'interview.ics', content: msg.icsAttachment.toString('base64'), content_type: 'text/calendar; method=REQUEST' }]
      : undefined

    const { error } = await resend.emails.send({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(resendAttachments ? { attachments: resendAttachments } : {}),
      ...(msg.resendTags ? { tags: msg.resendTags } : {}),
    })

    if (error) {
      logError(msg.errorCategory, {
        provider: 'resend',
        error_message: error.message,
      })
      throw new Error(error.message)
    }
    return
  }

  // 3. No provider configured — dev/test fallback
  console.info(`[Pegasus Media Project] ${msg.logFallback}`)
}

// ─── Public send functions ────────────────────────────────────────────────────

/**
 * Send an email verification link.
 * Called by Better Auth when requireEmailVerification is enabled.
 * Not awaited by the caller (fire-and-forget) to prevent timing attacks.
 */
export async function sendVerificationEmail(data: {
  user: { email: string; name: string }
  url: string
  token: string
}): Promise<void> {
  try {
    await sendEmail({
      to: data.user.email,
      subject: 'Verify your email address — Pegasus Media Project',
      html: buildVerificationHtml({ url: data.url }),
      text: buildVerificationText({ url: data.url }),
      resendTags: [{ name: 'category', value: 'verification' }],
      logFallback: 'Verification email suppressed — no email provider configured (set SMTP_HOST or RESEND_API_KEY)',
      errorCategory: 'email.verification_send_failed',
    })
  }
  catch {
    // fire-and-forget — error already logged inside sendEmail
  }
}

/**
 * Send a password reset link.
 * Called by Better Auth when sendResetPassword is configured.
 * Not awaited by the caller (fire-and-forget) to prevent timing attacks.
 */
export async function sendPasswordResetEmail(data: {
  user: { email: string; name: string }
  url: string
  token: string
}): Promise<void> {
  try {
    await sendEmail({
      to: data.user.email,
      subject: 'Reset your password — Pegasus Media Project',
      html: buildPasswordResetHtml({ url: data.url }),
      text: buildPasswordResetText({ url: data.url }),
      resendTags: [{ name: 'category', value: 'password-reset' }],
      logFallback: 'Password reset email suppressed — no email provider configured (set SMTP_HOST or RESEND_API_KEY)',
      errorCategory: 'email.password_reset_send_failed',
    })
  }
  catch {
    // fire-and-forget — error already logged inside sendEmail
  }
}

/**
 * Send an organization invitation email.
 * Falls back to console.info when no email provider is configured.
 */
export async function sendOrgInvitationEmail(data: {
  id: string
  email: string
  inviter: { user: { name: string; email: string } }
  organization: { name: string }
  role: string
}, inviteLink: string): Promise<void> {
  await sendEmail({
    to: data.email,
    subject: `You're invited to join ${data.organization.name} on Pegasus Media Project`,
    html: buildInvitationHtml({
      inviteeName: data.email,
      inviterName: data.inviter.user.name,
      inviterEmail: data.inviter.user.email,
      organizationName: data.organization.name,
      role: data.role,
      inviteLink,
    }),
    text: buildInvitationText({
      inviterName: data.inviter.user.name,
      organizationName: data.organization.name,
      role: data.role,
      inviteLink,
    }),
    resendTags: [
      { name: 'category', value: 'invitation' },
      { name: 'organization', value: data.organization.name.slice(0, 256).replace(/[^a-zA-Z0-9_-]/g, '_') },
    ],
    logFallback:
      `Invitation email → ${data.email} | ` +
      `Invited by ${data.inviter.user.name} (${data.inviter.user.email}) | ` +
      `Org: ${data.organization.name} | ` +
      `Role: ${data.role} | ` +
      `Link: ${inviteLink}`,
    errorCategory: 'email.invitation_send_failed',
  })
}

// ─────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────

function buildInvitationHtml(params: {
  inviteeName: string
  inviterName: string
  inviterEmail: string
  organizationName: string
  role: string
  inviteLink: string
}): string {
  const { inviterName, organizationName, role, inviteLink } = params

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to ${escapeHtml(organizationName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">Pegasus Media Project</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#09090b;">You've been invited</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
                <strong>${escapeHtml(inviterName)}</strong> has invited you to join
                <strong>${escapeHtml(organizationName)}</strong> as a <strong>${escapeHtml(role)}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">
                Click the button below to accept the invitation. You'll need to sign in or create an account first.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(inviteLink)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:1;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a;">
                This invitation expires in 48 hours. If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Sent by Pegasus Media Project &mdash; Open-source applicant tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildInvitationText(params: {
  inviterName: string
  organizationName: string
  role: string
  inviteLink: string
}): string {
  return [
    `You've been invited to join ${params.organizationName}`,
    '',
    `${params.inviterName} has invited you to join ${params.organizationName} as a ${params.role}.`,
    '',
    'Accept the invitation by visiting the link below:',
    params.inviteLink,
    '',
    'This invitation expires in 48 hours.',
    'If you didn\'t expect this email, you can safely ignore it.',
    '',
    '— Pegasus Media Project',
  ].join('\n')
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────────
// Email verification & password reset templates
// ─────────────────────────────────────────────

function buildVerificationHtml(params: { url: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">Pegasus Media Project</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#09090b;">Verify your email</h2>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">
                Click the button below to verify your email address and activate your account.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(params.url)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:1;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Sent by Pegasus Media Project &mdash; Open-source applicant tracking</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildVerificationText(params: { url: string }): string {
  return [
    'Verify your email address',
    '',
    'Click the link below to verify your email and activate your Pegasus Media Project account:',
    params.url,
    '',
    'If you didn\'t create an account, you can safely ignore this email.',
    '',
    '— Pegasus Media Project',
  ].join('\n')
}

function buildPasswordResetHtml(params: { url: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">Pegasus Media Project</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#09090b;">Reset your password</h2>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">
                Click the button below to reset your password. This link will expire shortly.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(params.url)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:1;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a;">
                If you didn't request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Sent by Pegasus Media Project &mdash; Open-source applicant tracking</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildPasswordResetText(params: { url: string }): string {
  return [
    'Reset your password',
    '',
    'Click the link below to reset your Pegasus Media Project password:',
    params.url,
    '',
    'If you didn\'t request this, you can safely ignore this email.',
    '',
    '— Pegasus Media Project',
  ].join('\n')
}

// ─────────────────────────────────────────────
// Applicant confirmation emails
// ─────────────────────────────────────────────

export interface ApplicationConfirmationParams {
  to: string
  firstName?: string
  jobTitle: string
  code: string
  statusUrl: string
  /** Display name used in the header/footer; falls back to the product name. */
  organizationName?: string
  /** Absolute https URL of the org/career-page logo, shown in the header. */
  logoUrl?: string
  /** Read-only copy of what the applicant submitted, rendered in the email. */
  summary?: Array<{ label: string, value: string }>
  /** When set, renders an application-fee reminder with a payment link. */
  fee?: {
    url: string
    /** Amount in minor units (cents); optional. */
    amount?: number | null
    /** ISO 4217 currency code; optional. */
    currency?: string | null
  }
}

/** Format a minor-unit fee amount (e.g. 2500 → "$25.00") for display. */
export function formatFeeAmount(amount?: number | null, currency?: string | null): string | null {
  if (amount == null) return null
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount / 100)
  }
  catch {
    return `${(amount / 100).toFixed(2)} ${code}`
  }
}

/**
 * Email an applicant their confirmation code + a link to check status.
 * Best-effort: falls back to a console log when no mail provider is configured.
 */
export async function sendApplicationConfirmationEmail(
  params: ApplicationConfirmationParams,
): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Application received — ${params.jobTitle}`,
    html: buildApplicationConfirmationHtml(params),
    text: buildApplicationConfirmationText(params),
    logFallback: `Application confirmation for ${params.to} — code ${params.code} (${params.jobTitle})`,
    errorCategory: 'application_confirmation_email',
  })
}

function buildApplicationConfirmationHtml(params: ApplicationConfirmationParams): string {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : 'Hi,'
  const orgName = params.organizationName?.trim() || 'Pegasus Media Project'
  const header = params.logoUrl
    ? `<img src="${escapeHtml(params.logoUrl)}" alt="${escapeHtml(orgName)}" height="40" style="max-height:40px;width:auto;display:inline-block;" />`
    : `<h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">${escapeHtml(orgName)}</h1>`
  const summaryRows = (params.summary ?? [])
    .filter((item) => item.value != null && String(item.value).trim() !== '')
    .map((item) => `
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;vertical-align:top;font-size:12px;color:#71717a;width:40%;">${escapeHtml(item.label)}</td>
                    <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f4f4f5;vertical-align:top;font-size:13px;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(item.value)}</td>
                  </tr>`)
    .join('')
  const summaryBlock = summaryRows
    ? `
              <div style="margin:0 0 24px;">
                <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;margin-bottom:8px;">Your application</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;">${summaryRows}
                </table>
              </div>`
    : ''
  const feeAmount = params.fee ? formatFeeAmount(params.fee.amount, params.fee.currency) : null
  const feeBlock = params.fee
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:16px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
                    <div style="font-size:14px;font-weight:600;color:#92400e;margin-bottom:6px;">Action needed: pay your application fee</div>
                    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#78716c;">
                      This application requires a fee${feeAmount ? ` of <strong>${escapeHtml(feeAmount)}</strong>` : ''}, payable now. A member of our team will manually verify your payment.
                    </p>
                    <a href="${escapeHtml(params.fee.url)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:10px 24px;background-color:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:1;">
                      Pay application fee
                    </a>
                  </td>
                </tr>
              </table>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Application received</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              ${header}
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#09090b;">Application received</h2>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#3f3f46;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">
                Thanks for applying for <strong>${escapeHtml(params.jobTitle)}</strong>. Your application is now with the team. Use the confirmation code below to check your status at any time.
              </p>
              ${summaryBlock}
              ${feeBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="padding:16px;background-color:#f4f4f5;border-radius:8px;">
                    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;margin-bottom:6px;">Confirmation code</div>
                    <div style="font-size:28px;font-weight:700;letter-spacing:0.18em;color:#09090b;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${escapeHtml(params.code)}</div>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(params.statusUrl)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;line-height:1;">
                      Check application status
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a;">
                Save this code — it's the only way to look up your application. We'll be in touch about next steps.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Sent by ${escapeHtml(orgName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildApplicationConfirmationText(params: ApplicationConfirmationParams): string {
  const orgName = params.organizationName?.trim() || 'Pegasus Media Project'
  const summaryLines = (params.summary ?? [])
    .filter((item) => item.value != null && String(item.value).trim() !== '')
    .map((item) => `- ${item.label}: ${item.value}`)
  const summaryBlock = summaryLines.length
    ? ['', 'Your application:', ...summaryLines]
    : []
  const feeAmount = params.fee ? formatFeeAmount(params.fee.amount, params.fee.currency) : null
  const feeBlock = params.fee
    ? [
        '',
        'ACTION NEEDED — PAY YOUR APPLICATION FEE',
        `This application requires a fee${feeAmount ? ` of ${feeAmount}` : ''}, payable now. A member of our team will manually verify your payment.`,
        `Pay here: ${params.fee.url}`,
      ]
    : []
  return [
    'Application received',
    '',
    params.firstName ? `Hi ${params.firstName},` : 'Hi,',
    '',
    `Thanks for applying for ${params.jobTitle}. Your application is now with the team.`,
    ...summaryBlock,
    ...feeBlock,
    '',
    `Your confirmation code: ${params.code}`,
    `Check your status: ${params.statusUrl}`,
    '',
    'Save this code — it\'s the only way to look up your application.',
    '',
    `— ${orgName}`,
  ].join('\n')
}

// ─────────────────────────────────────────────
// Lifecycle emails (org-customizable, event-triggered)
// ─────────────────────────────────────────────

/**
 * Replace {{variable}} placeholders with values from a plain map. Unknown
 * placeholders are left intact — the map keys are the effective whitelist.
 */
export function renderTemplateGeneric(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key]! : match)
}

/** A resolved template (org custom row, or a built-in system default). */
interface ResolvedTemplate {
  subject: string
  body: string
}

/**
 * Resolve the template to use for a lifecycle event, in order:
 *   1. `preferredTemplateId` (a per-job override) — a system template id or a
 *      custom emailTemplate row id belonging to the org;
 *   2. the org's custom template for that type, if one exists;
 *   3. the built-in system default.
 * Mirrors the resolution order in the interview send-invitation endpoint.
 */
export async function resolveLifecycleTemplate(
  organizationId: string,
  templateType: SystemTemplateType,
  preferredTemplateId?: string | null,
): Promise<ResolvedTemplate | null> {
  if (preferredTemplateId) {
    const system = SYSTEM_TEMPLATES.find(t => t.id === preferredTemplateId)
    if (system) return { subject: system.subject, body: system.body }
    const preferred = await db.query.emailTemplate.findFirst({
      where: and(
        eq(emailTemplate.id, preferredTemplateId),
        eq(emailTemplate.organizationId, organizationId),
      ),
      columns: { subject: true, body: true },
    })
    if (preferred) return { subject: preferred.subject, body: preferred.body }
    // Dangling override (template deleted) — fall through to the defaults.
  }

  const custom = await db.query.emailTemplate.findFirst({
    where: and(
      eq(emailTemplate.organizationId, organizationId),
      eq(emailTemplate.templateType, templateType),
    ),
    columns: { subject: true, body: true },
  })
  if (custom) return { subject: custom.subject, body: custom.body }

  const system = SYSTEM_TEMPLATES.find(t => t.type === templateType)
  return system ? { subject: system.subject, body: system.body } : null
}

/**
 * Turn a rendered template body into safe HTML. Bodies support a Markdown
 * subset (bold, italic, links, lists, headings) — see shared/email-markdown.
 */
function lifecycleBodyToHtml(bodyText: string): string {
  return renderEmailMarkdown(bodyText)
}

/** Wrap a rendered lifecycle body in the standard branded email shell. */
function buildLifecycleEmailHtml(params: { orgName: string, logoUrl?: string, bodyText: string }): string {
  const header = params.logoUrl
    ? `<img src="${escapeHtml(params.logoUrl)}" alt="${escapeHtml(params.orgName)}" height="40" style="max-height:40px;width:auto;display:inline-block;" />`
    : `<h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">${escapeHtml(params.orgName)}</h1>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              ${header}
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:14px;line-height:1.6;color:#3f3f46;">
              ${lifecycleBodyToHtml(params.bodyText)}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Sent by ${escapeHtml(params.orgName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface LifecycleEmailParams {
  to: string
  organizationId: string
  templateType: SystemTemplateType
  /** Per-job template override (system id or custom emailTemplate id). */
  templateId?: string | null
  /** Values substituted into the resolved subject/body template. */
  vars: Record<string, string>
  organizationName?: string
  logoUrl?: string
  /** Prepended verbatim to the rendered subject (used by test sends). */
  subjectPrefix?: string
}

/**
 * Resolve, render, and send an org-customizable lifecycle email. Best-effort:
 * falls back to a console log when no mail provider is configured. Returns
 * without sending if no template (custom or system) exists for the type.
 */
export async function sendLifecycleEmail(params: LifecycleEmailParams): Promise<void> {
  const template = await resolveLifecycleTemplate(params.organizationId, params.templateType, params.templateId)
  if (!template) {
    logError('email.lifecycle_template_missing', { template_type: params.templateType })
    return
  }
  const orgName = params.organizationName?.trim() || 'Pegasus Media Project'
  const vars = { organizationName: orgName, ...params.vars }
  const subject = (params.subjectPrefix ?? '') + renderTemplateGeneric(template.subject, vars)
  const body = renderTemplateGeneric(template.body, vars)

  await sendEmail({
    to: params.to,
    subject,
    html: buildLifecycleEmailHtml({ orgName, logoUrl: params.logoUrl, bodyText: body }),
    text: body,
    resendTags: [{ name: 'category', value: params.templateType.replace(/_/g, '-') }],
    logFallback: `Lifecycle email (${params.templateType}) → ${params.to} | Subject: ${subject}`,
    errorCategory: `email.${params.templateType}_send_failed`,
  })
}

export interface BulkApplicantEmailParams {
  to: string
  /** Already-rendered subject (placeholders substituted by the caller). */
  subject: string
  /** Already-rendered plain-text body (placeholders substituted by the caller). */
  body: string
  organizationName?: string
  logoUrl?: string
}

/**
 * Send a one-off custom email to an applicant, wrapped in the standard branded
 * shell. Used by the bulk-email tool to message a hand-picked set of applicants.
 * Reuses the same provider routing and console fallback as every other email.
 * Throws on transport failure so the caller can tally per-recipient results.
 */
export async function sendBulkApplicantEmail(params: BulkApplicantEmailParams): Promise<void> {
  const orgName = params.organizationName?.trim() || 'Pegasus Media Project'
  await sendEmail({
    to: params.to,
    subject: params.subject,
    html: buildLifecycleEmailHtml({ orgName, logoUrl: params.logoUrl, bodyText: params.body }),
    text: params.body,
    resendTags: [{ name: 'category', value: 'bulk-applicant' }],
    logFallback: `Bulk applicant email → ${params.to} | Subject: ${params.subject}`,
    errorCategory: 'email.bulk_applicant_send_failed',
  })
}

/** Built-in default template for a slot self-scheduling invitation. */
export const DEFAULT_SLOT_INVITATION_SUBJECT = 'Schedule your interview for {{jobTitle}}'
export const DEFAULT_SLOT_INVITATION_BODY = [
  'Hi {{candidateFirstName}},',
  '',
  'We\'d like to invite you to interview for {{jobTitle}} at {{organizationName}}.',
  '',
  'Please pick a time that works for you using the link below:',
  '{{bookingUrl}}',
  '',
  'This link expires on {{expiresAt}}.',
  '',
  'We look forward to speaking with you.',
  '',
  '{{organizationName}}',
].join('\n')

/**
 * Notify a candidate their interview was cancelled. Plain email (no .ics —
 * synced Google Calendar events are cancelled through the Calendar API).
 */
export async function sendInterviewCancellationEmail(params: {
  to: string
  candidateFirstName: string
  jobTitle: string
  organizationName: string
  interviewTitle: string
  interviewDate: string
  interviewTime: string
  /** Extra sentence after the cancellation notice (e.g. "You'll receive a new scheduling link shortly."). */
  followUpNote?: string
}): Promise<void> {
  const subject = `Interview cancelled: ${params.jobTitle} at ${params.organizationName}`
  const bodyLines = [
    `Hi ${params.candidateFirstName},`,
    '',
    `Your interview for ${params.jobTitle} at ${params.organizationName}, previously scheduled for ${params.interviewDate} at ${params.interviewTime}, has been cancelled.`,
    ...(params.followUpNote ? ['', params.followUpNote] : []),
    '',
    params.organizationName,
  ]
  const text = bodyLines.join('\n')
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#09090b;">
      ${bodyLines.filter(l => l !== '').map(l => `<p style="font-size:14px;">${escapeHtml(l)}</p>`).join('')}
    </div>
  `.trim()

  await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    resendTags: [{ name: 'category', value: 'interview-cancellation' }],
    logFallback: `Interview cancellation → ${params.to} | ${params.interviewTitle} | was ${params.interviewDate} at ${params.interviewTime}`,
    errorCategory: 'email.interview_cancellation_send_failed',
  })
}

/** Built-in template for a reschedule notification (uses interview vars). */
export const DEFAULT_RESCHEDULE_SUBJECT = 'Interview rescheduled: {{jobTitle}} at {{organizationName}}'
export const DEFAULT_RESCHEDULE_BODY = [
  'Hi {{candidateFirstName}},',
  '',
  'Your interview for {{jobTitle}} at {{organizationName}} has been rescheduled.',
  '',
  'New time:',
  '- Date: {{interviewDate}}',
  '- Time: {{interviewTime}}',
  '- Duration: {{interviewDuration}} minutes',
  '- Type: {{interviewType}}',
  '- Location: {{interviewLocation}}',
  '',
  'The attached calendar invite replaces the previous one. Please confirm the new time using the links below.',
  '',
  '{{organizationName}}',
].join('\n')

export interface SlotInvitationEmailParams {
  to: string
  /** Already-rendered subject (placeholders substituted by the caller). */
  subject: string
  /** Already-rendered plain-text body (placeholders substituted by the caller). */
  body: string
  organizationName?: string
  logoUrl?: string
}

/**
 * Send a "pick your interview time" invitation. Unlike a fixed-time interview
 * invitation, there is no date/time or .ics at send time — the body carries a
 * booking link the candidate uses to choose an available slot.
 */
export async function sendSlotInvitationEmail(params: SlotInvitationEmailParams): Promise<void> {
  const orgName = params.organizationName?.trim() || 'Pegasus Media Project'
  await sendEmail({
    to: params.to,
    subject: params.subject,
    html: buildLifecycleEmailHtml({ orgName, logoUrl: params.logoUrl, bodyText: params.body }),
    text: params.body,
    resendTags: [{ name: 'category', value: 'slot-invitation' }],
    logFallback: `Slot invitation email → ${params.to} | Subject: ${params.subject}`,
    errorCategory: 'email.slot_invitation_send_failed',
  })
}

/**
 * Confirm a candidate's self-scheduled interview booking. Sent best-effort
 * right after a slot is booked; attaches an .ics for the chosen time.
 */
export async function sendBookingConfirmationEmail(params: {
  to: string
  candidateFirstName: string
  jobTitle: string
  organizationName: string
  interviewTitle: string
  interviewDate: string
  interviewTime: string
  interviewLocation: string | null
  icsContent?: string
}): Promise<void> {
  const lines = [
    `${params.interviewTitle} — ${params.jobTitle}`,
    `When: ${params.interviewDate} at ${params.interviewTime}`,
    ...(params.interviewLocation ? [`Where: ${params.interviewLocation}`] : []),
  ]
  const subject = `Interview confirmed: ${params.interviewDate} at ${params.interviewTime}`
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#09090b;">
      <p style="font-size:14px;">Hi ${escapeHtml(params.candidateFirstName)},</p>
      <p style="font-size:14px;">Your interview with ${escapeHtml(params.organizationName)} is confirmed.</p>
      <table style="font-size:14px;border-collapse:collapse;margin:16px 0;">
        ${lines.map(l => `<tr><td style="padding:4px 0;">${escapeHtml(l)}</td></tr>`).join('')}
      </table>
      <p style="font-size:13px;color:#52525b;">A calendar invite is attached. If you need to change this time, reply to this email.</p>
    </div>
  `.trim()
  const text = `Hi ${params.candidateFirstName},\n\nYour interview with ${params.organizationName} is confirmed.\n\n${lines.join('\n')}\n\nA calendar invite is attached. If you need to change this time, reply to this email.`

  await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    icsAttachment: params.icsContent ? Buffer.from(params.icsContent) : undefined,
    resendTags: [{ name: 'category', value: 'slot-booking-confirmation' }],
    logFallback:
      `Booking confirmation → ${params.to} | ${params.interviewTitle} | ` +
      `${params.interviewDate} at ${params.interviewTime}` +
      (params.icsContent ? ' | .ics attached' : ''),
    errorCategory: 'email.booking_confirmation_send_failed',
  })
}

// ─────────────────────────────────────────────
// Interview invitation emails
// ─────────────────────────────────────────────

export interface InterviewEmailData {
  candidateName: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  jobTitle: string
  interviewTitle: string
  interviewDate: string
  interviewTime: string
  interviewDuration: number
  interviewType: string
  interviewLocation: string | null
  interviewers: string[] | null
  organizationName: string
  /** Response URLs for accept/decline/tentative (omitted = no response links) */
  responseUrls?: {
    accepted: string
    declined: string
    tentative: string
  }
  /** iCalendar (.ics) file content to attach */
  icsContent?: string
}

/**
 * Replace {{variable}} placeholders in a template string with actual values.
 * Only replaces known variables to prevent injection of unexpected content.
 */
export function renderTemplate(template: string, data: InterviewEmailData): string {
  const variables: Record<string, string> = {
    candidateName: data.candidateName,
    candidateFirstName: data.candidateFirstName,
    candidateLastName: data.candidateLastName,
    candidateEmail: data.candidateEmail,
    jobTitle: data.jobTitle,
    interviewTitle: data.interviewTitle,
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewDuration: String(data.interviewDuration),
    interviewType: data.interviewType,
    interviewLocation: data.interviewLocation ?? 'To be confirmed',
    interviewers: data.interviewers?.join(', ') ?? 'To be confirmed',
    organizationName: data.organizationName,
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key]! : match
  })
}

/**
 * Send an interview invitation email to a candidate.
 * Includes an .ics calendar attachment and response links when provided.
 * Falls back to console.info when no email provider is configured.
 */
export async function sendInterviewInvitationEmail(params: {
  subject: string
  body: string
  data: InterviewEmailData
}): Promise<void> {
  const renderedSubject = renderTemplate(params.subject, params.data)
  const renderedBody = renderTemplate(params.body, params.data)

  const icsBuffer = params.data.icsContent ? Buffer.from(params.data.icsContent) : undefined

  await sendEmail({
    to: params.data.candidateEmail,
    subject: renderedSubject,
    html: buildInterviewInvitationHtml(renderedSubject, renderedBody, params.data),
    text: buildInterviewInvitationText(renderedBody, params.data.responseUrls),
    icsAttachment: icsBuffer,
    resendTags: [
      { name: 'category', value: 'interview-invitation' },
      { name: 'interview', value: params.data.interviewTitle.slice(0, 256).replace(/[^a-zA-Z0-9_-]/g, '_') },
    ],
    logFallback:
      `Interview invitation email → ${params.data.candidateEmail} | ` +
      `Subject: ${renderedSubject} | ` +
      `Interview: ${params.data.interviewTitle} | ` +
      `Date: ${params.data.interviewDate} at ${params.data.interviewTime}` +
      (params.data.icsContent ? ' | .ics attached' : '') +
      (params.data.responseUrls ? ' | response links included' : ''),
    errorCategory: 'email.interview_invitation_send_failed',
  })
}

/**
 * Notify a reviewer (org member or guest) that they've been assigned to an
 * interview. Attaches an .ics so they can add it to their calendar when the
 * event isn't synced to Google (the Google-attendee path handles synced ones).
 */
export async function sendReviewerInterviewInvitationEmail(params: {
  to: string
  reviewerName: string | null
  interviewTitle: string
  jobTitle: string
  candidateName: string
  interviewDate: string
  interviewTime: string
  interviewLocation: string | null
  organizationName: string
  icsContent?: string
}): Promise<void> {
  const greeting = params.reviewerName ? `Hi ${params.reviewerName},` : 'Hi,'
  const lines = [
    `${params.interviewTitle} — ${params.jobTitle}`,
    `Candidate: ${params.candidateName}`,
    `When: ${params.interviewDate} at ${params.interviewTime}`,
    ...(params.interviewLocation ? [`Where: ${params.interviewLocation}`] : []),
  ]
  const subject = `You're a reviewer: ${params.interviewTitle} — ${params.candidateName}`
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#09090b;">
      <p style="font-size:14px;">${escapeHtml(greeting)}</p>
      <p style="font-size:14px;">You've been assigned as a reviewer for an interview at ${escapeHtml(params.organizationName)}.</p>
      <table style="font-size:14px;border-collapse:collapse;margin:16px 0;">
        ${lines.map(l => `<tr><td style="padding:4px 0;">${escapeHtml(l)}</td></tr>`).join('')}
      </table>
      <p style="font-size:13px;color:#52525b;">A calendar invite is attached. You'll be able to rate and add notes for this candidate once the interview stage begins.</p>
    </div>
  `.trim()
  const text = `${greeting}\n\nYou've been assigned as a reviewer for an interview at ${params.organizationName}.\n\n${lines.join('\n')}\n\nA calendar invite is attached.`

  await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    icsAttachment: params.icsContent ? Buffer.from(params.icsContent) : undefined,
    resendTags: [{ name: 'category', value: 'reviewer-interview-invitation' }],
    logFallback:
      `Reviewer interview invitation → ${params.to} | Interview: ${params.interviewTitle} | ` +
      `Candidate: ${params.candidateName} | ${params.interviewDate} at ${params.interviewTime}` +
      (params.icsContent ? ' | .ics attached' : ''),
    errorCategory: 'email.reviewer_interview_invitation_send_failed',
  })
}

function buildInterviewInvitationHtml(subject: string, bodyText: string, data: InterviewEmailData): string {
  // Bodies support the shared Markdown subset (bold, italic, links, lists).
  const bodyHtml = renderEmailMarkdown(bodyText)

  // Build response buttons HTML when URLs are available
  const responseButtonsHtml = data.responseUrls
    ? `
          <!-- Response Buttons -->
          <tr>
            <td style="padding:0 32px 32px;">
              <div style="border-top:1px solid #e4e4e7;padding-top:24px;">
                <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#09090b;text-align:center;">
                  Can you make it?
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:0 4px;">
                            <a href="${escapeHtml(data.responseUrls.accepted)}" target="_blank" rel="noopener noreferrer"
                               style="display:inline-block;padding:10px 20px;background-color:#16a34a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;line-height:1;">
                              &#10003; Accept
                            </a>
                          </td>
                          <td style="padding:0 4px;">
                            <a href="${escapeHtml(data.responseUrls.tentative)}" target="_blank" rel="noopener noreferrer"
                               style="display:inline-block;padding:10px 20px;background-color:#ca8a04;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;line-height:1;">
                              &#63; Maybe
                            </a>
                          </td>
                          <td style="padding:0 4px;">
                            <a href="${escapeHtml(data.responseUrls.declined)}" target="_blank" rel="noopener noreferrer"
                               style="display:inline-block;padding:10px 20px;background-color:#dc2626;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;line-height:1;">
                              &#10005; Decline
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f4f4f5;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#09090b;">${escapeHtml(data.organizationName)}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <div style="font-size:14px;line-height:1.7;color:#3f3f46;">
                ${bodyHtml}
              </div>
            </td>
          </tr>${responseButtonsHtml}
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Sent by ${escapeHtml(data.organizationName)} via Pegasus Media Project
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Build plain-text email body with response links appended.
 */
function buildInterviewInvitationText(
  renderedBody: string,
  responseUrls?: InterviewEmailData['responseUrls'],
): string {
  if (!responseUrls) return renderedBody

  return [
    renderedBody,
    '',
    '─────────────────────────────',
    'Respond to this invitation:',
    '',
    `✓ Accept: ${responseUrls.accepted}`,
    `? Maybe:  ${responseUrls.tentative}`,
    `✗ Decline: ${responseUrls.declined}`,
    '',
    '─────────────────────────────',
  ].join('\n')
}
