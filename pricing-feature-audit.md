# Pricing Feature Audit

Cross-reference of every feature in the pricing comparison table (`reqcore-web/app/pages/pricing.vue`)
against actual implementation and billing gates in `reqcore`.

Legend:
- **✅** — Implemented and matches the table claim (correct gate or correct "all plans")
- **❌ GAP** — Listed in table but no gate exists, or gated at wrong tier
- **❌ DISCREPANCY** — Gated in code but at a different tier than the table claims
- **✅ human-process** — No code gate needed; delivered by the team, not enforced in the app

Source of truth for gates: `shared/billing.ts` + `server/utils/billing/plan.ts`.

---

## Plan Limits

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 1 | **Monthly price** | Informational | ✅ Stripe enforces actual charge; display-only field in `shared/billing.ts` |
| 2 | **Yearly price** | Informational | ✅ Same as above |
| 3 | **Active roles** | free=1, solo=2, team=8, scale=24, agency=∞ | ✅ `assertActiveRoleLimit()` in `plan.ts` enforces this on every job open/create; limit table in `ACTIVE_ROLE_LIMITS` |
| 4 | **Applicants** | Unlimited all plans | ✅ No applicant cap exists anywhere in the codebase |
| 5 | **Hires per role** | Unlimited all plans | ✅ No hire cap exists |
| 6 | **Team seats** | No per-seat fees all plans | ✅ No seat tracking or seat limit implemented |
| 7 | **Card required to start** | No for all plans | ✅ Free tier has no subscription row; Stripe checkout only triggered on upgrade |

---

## Public Hiring Funnel

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 8 | **Public job board** | All plans | ✅ Public job listing pages exist; no billing gate |
| 9 | **SEO job pages with custom slugs** | All plans | ✅ Jobs have URL slugs; pages rendered server-side for SEO; no gate |
| 10 | **Google Jobs JSON-LD** | All plans | ✅ Structured data on job pages; no gate |
| 11 | **Markdown job descriptions** | All plans | ✅ Job description field accepts markdown; no gate |
| 12 | **Custom application forms** | All plans | ✅ Custom fields on application forms implemented; no gate |
| 13 | **Required and optional questions** | All plans | ✅ Field-level required/optional flag exists; no gate |
| 14 | **Resume and file upload fields** | All plans | ✅ File upload fields implemented; no gate |
| 15 | **Tracking links** | All plans | ✅ Source tracking links and UTM params implemented at `/dashboard/source-tracking/`; no gate |
| 16 | **Source attribution dashboard** | Team+ | ❌ **GAP** — The source-tracking dashboard (`/dashboard/source-tracking/index.vue`) exists and is accessible with no billing check on the page or any backing API. Free and Solo orgs can use it. |

---

## Candidate Database and Pipeline

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 17 | **Searchable candidate pool** | All plans | ✅ Candidate index with search exists; no gate |
| 18 | **Candidate profiles** | All plans | ✅ Candidate detail page at `/dashboard/candidates/[id].vue`; no gate |
| 19 | **Email deduplication** | All plans | ✅ Implemented at application creation; no gate |
| 20 | **Application history per candidate** | All plans | ✅ Cross-role application history on candidate profiles; no gate |
| 21 | **Uploaded document storage** | All plans | ✅ Private S3/storage bucket per org; no gate |
| 22 | **Inline PDF resume preview** | All plans | ✅ PDF preview in application detail; no gate |
| 23 | **Unified applications list** | All plans | ✅ `/dashboard/applications/index.vue`; no gate |
| 24 | **Status workflow validation** | All plans | ✅ Application status transitions validated server-side; no gate |
| 25 | **Kanban hiring pipeline** | Solo+ (free=false) | ❌ **GAP** — `shared/billing.ts` (L153–155) explicitly documents this is *not* gated: *"Candidate stage/pipeline movement (the application-status workflow) — core to every plan; the pricing 'pipeline and stages' bullet is forward-looking marketing, not a gate on the basic workflow."* Free orgs have full pipeline access today. |
| 26 | **Activity timeline** | Team+ (free/solo=false) | ❌ **GAP** — The timeline page exists at `/dashboard/timeline.vue` with no billing check. No `hasFeature` call on the page, no server-side API gate. Free and Solo orgs can see it. |

---

## AI Review and Shortlisting

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 27 | **Resume parsing** | All plans | ✅ Resume extraction runs as part of the AI analysis pipeline; no separate gate |
| 28 | **AI shortlist ranked against criteria** | All plans | ✅ All orgs can trigger AI analysis; budget/quota is the gate, not the feature itself |
| 29 | **AI shortlist quota** | Free=1 full shortlist; paid=unlimited | ✅ Free orgs: `FREE_PLAN_ANALYSIS_LIMIT = 50` lifetime platform-paid runs (`server/utils/ai/budget.ts`). Paid orgs: unlimited runs within a per-plan monthly $ budget. The "1 full shortlist" in the table is the marketing description of the 50-run lifetime pool. |
| 30 | **Per-job scoring criteria** | All plans | ✅ Job-level scoring criteria exist; no gate |
| 31 | **Score breakdown and reasoning** | All plans | ✅ AI returns per-criterion scores and reasoning; no gate |
| 32 | **Human review before decisions** | All plans | ✅ No auto-reject/accept mechanic exists; every decision requires a manual status change |
| 33 | **AI Analysis dashboard** | Team+ (free/solo=false) | ❌ **GAP** — Page at `/dashboard/ai-analysis.vue` has no billing check. No `hasFeature` call on the page, no server API gate. Free and Solo orgs can access it. |
| 34 | **Provider health and scoring volume** | Team+ | ❌ **GAP** — Same page as AI Analysis dashboard (#33); same gap applies. |
| 35 | **OpenAI, Anthropic, or Ollama (BYOK)** | Scale+ | ✅ `assertPlanFeature(orgId, 'byok')` at `POST /api/ai-config` (server); `hasFeature('byok')` gate at `/dashboard/settings/ai/new.vue` (frontend). Hard 402 for Solo/Team. |

---

## Scheduling and Recruiter Workspace

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 36 | **Interview scheduling** | Solo+ (free=false) | ✅ `assertPlanFeature(orgId, 'interviews')` enforced at `POST /api/interviews`. Frontend: `hasFeature('interviews')` in `InterviewScheduleSidebar.vue`. |
| 37 | **Google Calendar sync** | Solo+ (free=false, solo=true) | ❌ **DISCREPANCY** — Code gates this at **Team+**, not Solo+. `FEATURE_MIN_TIER.calendar = 'team'` (`shared/billing.ts:187`). `assertTierFeature(tier, 'calendar')` is called at `POST /api/interviews` when `calendarSync=true`. The Google Calendar settings page also checks `hasFeature('calendar')` (Team+). Solo users can create interviews but **cannot** enable Google Calendar sync. The table overclaims this at Solo. |
| 38 | **iCalendar invitations** | Solo+ | ✅ iCal is part of the interview email flow, which is gated behind `interviews` (Solo+). Effectively correct. |
| 39 | **Candidate confirm/decline links** | Solo+ | ✅ Part of the interview scheduling email; gated by `interviews` (Solo+). Effectively correct. |
| 40 | **Interview template integration** | Solo+ | ✅ Template selection is in the interview creation UI gated by `interviews` (Solo+). Effectively correct. |
| 41 | **Recruiter dashboard** | All plans | ✅ Dashboard index at `/dashboard/index.vue`; no gate |
| 42 | **Open jobs, candidates, and unreviewed stats** | All plans | ✅ Stats shown on recruiter dashboard; no gate |

---

## Security, Control, and Support

| # | Feature | Table claim | Status |
|---|---------|------------|--------|
| 43 | **Organization-scoped data** | All plans | ✅ All DB queries filter by `organizationId`; structural, not a billing gate |
| 44 | **Role-based organization membership** | All plans | ✅ Owner/admin/member roles enforced; no billing gate |
| 45 | **Private document bucket** | All plans | ✅ S3/storage bucket is org-isolated; no billing gate |
| 46 | **Server-proxied document access** | All plans | ✅ All document URLs go through the server API, never directly to storage; no gate |
| 47 | **File MIME validation** | All plans | ✅ MIME type checked on upload; no gate |
| 48 | **API and public form rate limiting** | All plans | ✅ `server/middleware/api-rate-limit.ts` applies to all orgs |
| 49 | **Custom domain and no Reqcore branding** | Team+ (free/solo=false) | ❌ **GAP** — Mentioned in billing.ts Team feature bullets but there is no `PlanFeature` entry, no `assertPlanFeature` call, no `hasFeature` check, and no setting in the app to configure a custom domain yet. Feature is aspirational/not built. |
| 50 | **Support** (Self-serve / Email / Priority / Dedicated) | Tiered | ✅ human-process — No code gate; delivered by the support team based on plan |
| 51 | **Dedicated onboarding** | Scale+ | ✅ human-process — No code gate; onboarding delivered manually |
| 52 | **Custom contract and invoicing** | Agency+ | ✅ human-process — No code gate; manual contracting |
| 53 | **Security and legal review** | Agency+ | ✅ human-process — No code gate; manual review |

---

## Summary of Gaps

### ✅ Fixed (gate now implemented)
| Feature | Tier | Resolution |
|---------|------|-----------|
| Source attribution dashboard | Team+ | New `sourceAnalytics` feature. Server gate `assertPlanFeature(orgId, 'sourceAnalytics')` on `GET /api/source-tracking/stats`; page shows a `FeatureLockCard` and defers the stats fetch (`useSourceTracking({ enabled })`). |
| Activity timeline | Team+ | New `activityTimeline` feature. Server gate on `GET /api/activity-log/timeline` (per-candidate `candidate-timeline.get.ts` left open — that's #20). Page locks behind a `FeatureLockCard` and defers `loadInitial()`. |
| AI Analysis dashboard | Team+ | New `aiAnalytics` feature. Server gate on `GET /api/ai-analysis/stats`; page shows a `FeatureLockCard` and defers the fetch until entitled. |
| Provider health & scoring volume | Team+ | Same page/endpoint as AI Analysis — covered by the `aiAnalytics` gate. |
| Google Calendar sync (wrong tier) | Team+ | Code was already correct (`FEATURE_MIN_TIER.calendar = 'team'`). Fixed the **marketing table** in `reqcore-web/app/pages/pricing.vue`, which overclaimed it at Solo; Solo keeps interview scheduling + iCal invites. |

Plus: `AppTopBar.vue` shows a lock icon on the three gated nav items, and unit coverage for the new gates was added to `tests/unit/billing-plan-resolution.test.ts`.

### ⏸️ Deliberately not implemented (decision required)
| Feature | Table says | Decision |
|---------|-----------|----------|
| Kanban hiring pipeline | Solo+ | **Left ungated by design.** `shared/billing.ts:153` documents the candidate stage/pipeline workflow as core to every plan; gating it would block free orgs from basic usage and undercut the product-led free→paid funnel. Recommended fix is the *table*, not the code — the marketing pricing page already lists the pipeline under Solo, so no change needed. |
| Custom domain / no Reqcore branding | Team+ | **Not built — nothing to gate.** No setting, no `PlanFeature` entry, no enforcement point exists. This is a feature to build (custom-domain config + branding removal), not a gate to add. Out of scope for closing pricing gaps. |
