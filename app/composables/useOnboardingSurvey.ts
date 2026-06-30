/**
 * Onboarding survey — single source of truth for the post-signup questions.
 *
 * The flow (app/pages/onboarding/welcome.vue) runs once, right after a brand-new
 * org is created, while the user is already identified in PostHog by their
 * `user.id`. Each answer is written to the user's PostHog *person* profile under
 * the `key` below, so the data lives on their account and can be used to segment
 * funnels, retention, and revenue — tagged with the plan they clicked on pricing.
 *
 * Every question is skippable: we capture what we get and never block signup.
 */

export interface SurveyOption {
  /** Stable value stored in PostHog — never change once shipped. */
  value: string
  label: string
}

export interface SurveyQuestion {
  /** Stable id; also the PostHog person-property key. Never change once shipped. */
  id: string
  /** Short headline shown to the user. */
  title: string
  /** Optional one-line helper under the headline. */
  subtitle?: string
  options: SurveyOption[]
}

/**
 * PostHog person-property keys written by the survey, beyond the per-question
 * answer keys. Kept here so analytics/tests share one definition.
 */
export const SURVEY_PERSON_PROPS = {
  /** Plan the visitor clicked on the pricing page (free | solo | team | scale). */
  plan: 'signup_plan',
  /** Billing cadence carried from pricing (monthly | annual), when a paid plan. */
  billing: 'signup_billing',
  /** Set true once the survey is finished (answered or skipped). */
  completed: 'onboarding_survey_completed',
} as const

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'company_size',
    title: 'How big is your team?',
    subtitle: 'So we can size your workspace right.',
    options: [
      { value: 'solo', label: 'Just me' },
      { value: '2-10', label: '2–10' },
      { value: '11-50', label: '11–50' },
      { value: '51-200', label: '51–200' },
      { value: '201-1000', label: '201–1,000' },
      { value: '1000+', label: '1,000+' },
    ],
  },
  {
    id: 'user_role',
    title: "What's your role?",
    subtitle: 'We tailor the experience to how you hire.',
    options: [
      { value: 'founder', label: 'Founder / owner / CEO' },
      { value: 'people_hr', label: 'HR / People / Talent' },
      { value: 'recruiter', label: 'Recruiter / Talent Acquisition' },
      { value: 'hiring_manager', label: 'Hiring manager / team lead' },
      { value: 'operations', label: 'Operations' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'discovery_source',
    title: 'How did you hear about Reqcore?',
    subtitle: 'Helps us know what to keep doing.',
    options: [
      { value: 'search', label: 'Google / search' },
      { value: 'ai_assistant', label: 'ChatGPT / AI assistant' },
      { value: 'reddit', label: 'Reddit' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'referral', label: 'A friend or colleague' },
      { value: 'other', label: 'Somewhere else' },
    ],
  },
  {
    id: 'choice_reason',
    title: 'What made you pick Reqcore?',
    subtitle: 'The one thing that tipped you over.',
    options: [
      { value: 'applicant_flood', label: 'Drowning in applicants' },
      { value: 'transparent_ai', label: 'Transparent AI ranking' },
      { value: 'unlimited_pricing', label: 'Unlimited applicants pricing' },
      { value: 'no_per_seat', label: 'No per-seat fees' },
      { value: 'switching_ats', label: 'Replacing another ATS' },
      { value: 'exploring', label: 'Just exploring for now' },
    ],
  },
  {
    id: 'hiring_frequency',
    title: 'How often do you hire?',
    subtitle: 'This drives how busy your shortlist gets.',
    options: [
      { value: 'always_on', label: 'Constantly — always-on hiring' },
      { value: 'monthly', label: 'A few roles a month' },
      { value: 'quarterly', label: 'A few roles a quarter' },
      { value: 'occasionally', label: 'Occasionally' },
      { value: 'first_hire', label: 'This is my first hire' },
    ],
  },
]

export function useOnboardingSurvey() {
  return { questions: SURVEY_QUESTIONS, personProps: SURVEY_PERSON_PROPS }
}
