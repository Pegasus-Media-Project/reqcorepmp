<script setup lang="ts">
import {
  ArrowRight,
  Check,
  Cloud,
  Github,
  LifeBuoy,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-vue-next'
import { BILLING_PLANS, type BillingPlan, type BillingPlanId } from '~~/shared/billing'

type PlanCard = {
  id: string
  name: string
  tagline: string
  price: string
  cadence: string
  features: string[]
  icon: typeof Cloud
  ctaLabel: string
  ctaTo?: string
  ctaHref?: string
  featured?: boolean
}

const localePath = useLocalePath()
const { data: session } = await authClient.useSession(useFetch)
const annual = ref(false)

const paidPlanIcons: Record<BillingPlanId, typeof Sparkles> = {
  'cloud-pro': Sparkles,
  'business': ShieldCheck,
}

const primaryCta = computed(() => session.value?.user
  ? { to: localePath('/dashboard'), label: 'Go to dashboard' }
  : { to: localePath('/auth/sign-up'), label: 'Start free' })

function paidPlanPrice(plan: BillingPlan): { price: string; cadence: string } {
  if (annual.value && plan.annualPrice != null) {
    return { price: `$${plan.annualPrice.toLocaleString('en-US')}`, cadence: '/year' }
  }

  return { price: `$${plan.monthlyPrice}`, cadence: '/month' }
}

const plans = computed<PlanCard[]>(() => [
  {
    id: 'community',
    name: 'Community',
    tagline: 'Self-host Reqcore on your own infrastructure.',
    price: '$0',
    cadence: 'forever',
    icon: Server,
    ctaLabel: 'View source',
    ctaHref: 'https://github.com/reqcore-inc/reqcore',
    features: [
      'Open-source ATS core',
      'Unlimited jobs and candidates',
      'Unlimited team members',
      'Postgres and object storage',
    ],
  },
  {
    id: 'cloud-free',
    name: 'Cloud Free',
    tagline: 'Hosted Reqcore for small teams getting started.',
    price: '$0',
    cadence: '/month',
    icon: Cloud,
    ctaLabel: 'Start free',
    ctaTo: localePath('/auth/sign-up'),
    features: [
      'Managed hosting',
      'Reqcore branding',
      'Core hiring pipeline',
      'No credit card required',
    ],
  },
  ...BILLING_PLANS.map((plan) => {
    const price = paidPlanPrice(plan)

    return {
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline,
      price: price.price,
      cadence: price.cadence,
      icon: paidPlanIcons[plan.id],
      ctaLabel: `Choose ${plan.name}`,
      ctaTo: localePath('/auth/sign-up'),
      featured: plan.id === 'cloud-pro',
      features: plan.features,
    }
  }),
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom support, procurement, and security review.',
    price: 'Custom',
    cadence: '',
    icon: LifeBuoy,
    ctaLabel: 'Contact us',
    ctaHref: 'mailto:hello@reqcore.com',
    features: [
      'Custom deployment guidance',
      'Security and legal review',
      'Dedicated support channel',
      'Roadmap and migration planning',
    ],
  },
])

useSeoMeta({
  title: 'Pricing',
  description: 'Simple, flat Reqcore pricing for self-hosted and cloud teams.',
  ogTitle: 'Reqcore Pricing',
  ogDescription: 'Self-host for free, start on cloud for free, or upgrade to flat org-wide plans.',
})

definePageMeta({ layout: false })
</script>

<template>
  <div class="min-h-screen bg-white text-surface-900 dark:bg-[#09090b] dark:text-white">
    <PublicNavBar active-page="pricing" />

    <main class="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <section class="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.55fr)] lg:items-end">
        <div>
          <div class="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs font-medium text-surface-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-surface-300">
            <img
              src="/reqcore-emoji-128-transparent.png"
              alt=""
              width="18"
              height="18"
              class="size-4.5 object-contain"
            />
            Flat pricing, no per-seat math
          </div>
          <h1 class="mt-6 max-w-3xl text-4xl font-bold leading-tight text-surface-950 dark:text-white sm:text-5xl lg:text-6xl">
            Pricing
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-surface-600 dark:text-surface-300 sm:text-lg">
            Start with the open-source build, use the hosted free tier, or upgrade when your team needs branding, integrations, SSO, and compliance controls.
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <NuxtLink
              :to="primaryCta.to"
              class="inline-flex items-center gap-2 rounded-lg bg-surface-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-surface-800 dark:bg-white dark:text-[#09090b] dark:hover:bg-white/90"
            >
              {{ primaryCta.label }}
              <ArrowRight class="size-4" />
            </NuxtLink>
            <a
              href="https://github.com/reqcore-inc/reqcore"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-5 py-3 text-sm font-semibold text-surface-700 transition hover:bg-surface-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-surface-200 dark:hover:bg-white/[0.06]"
            >
              <Github class="size-4" />
              GitHub
            </a>
          </div>
        </div>

        <div class="rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <p class="text-sm font-semibold text-surface-900 dark:text-white">Billing period</p>
          <div class="mt-3 grid grid-cols-2 rounded-lg border border-surface-200 bg-white p-1 text-sm dark:border-white/[0.08] dark:bg-[#09090b]">
            <button
              class="rounded-md px-3 py-2 font-medium transition"
              :class="!annual ? 'bg-surface-950 text-white dark:bg-white dark:text-[#09090b]' : 'text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-white'"
              @click="annual = false"
            >
              Monthly
            </button>
            <button
              class="rounded-md px-3 py-2 font-medium transition"
              :class="annual ? 'bg-surface-950 text-white dark:bg-white dark:text-[#09090b]' : 'text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-white'"
              @click="annual = true"
            >
              Annual
            </button>
          </div>
          <p class="mt-3 text-sm leading-6 text-surface-500 dark:text-surface-400">
            Annual plans show the display price used in the billing dashboard. Stripe remains the source of truth at checkout.
          </p>
        </div>
      </section>

      <section class="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article
          v-for="plan in plans"
          :key="plan.id"
          class="flex min-h-[430px] flex-col rounded-lg border bg-white p-5 dark:bg-surface-950"
          :class="plan.featured ? 'border-brand-300 ring-1 ring-brand-200 dark:border-brand-700 dark:ring-brand-800' : 'border-surface-200 dark:border-white/[0.08]'"
        >
          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-lg bg-surface-100 text-surface-700 dark:bg-white/[0.06] dark:text-surface-200">
              <component :is="plan.icon" class="size-4.5" />
            </div>
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold text-surface-950 dark:text-white">{{ plan.name }}</h2>
              <p v-if="plan.featured" class="text-xs font-medium text-brand-600 dark:text-brand-300">Popular</p>
            </div>
          </div>

          <div class="mt-5 flex min-h-12 items-end gap-1">
            <span class="text-3xl font-bold text-surface-950 dark:text-white">{{ plan.price }}</span>
            <span v-if="plan.cadence" class="pb-1 text-sm text-surface-400">{{ plan.cadence }}</span>
          </div>
          <p class="mt-3 min-h-12 text-sm leading-6 text-surface-500 dark:text-surface-400">{{ plan.tagline }}</p>

          <ul class="mt-5 flex-1 space-y-3">
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="flex gap-2 text-sm leading-5 text-surface-600 dark:text-surface-300"
            >
              <Check class="mt-0.5 size-4 shrink-0 text-brand-500" />
              <span>{{ feature }}</span>
            </li>
          </ul>

          <NuxtLink
            v-if="plan.ctaTo"
            :to="plan.ctaTo"
            class="mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
            :class="plan.featured ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-surface-200 bg-white text-surface-800 hover:bg-surface-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-surface-100 dark:hover:bg-white/[0.06]'"
          >
            {{ plan.ctaLabel }}
            <ArrowRight class="size-4" />
          </NuxtLink>
          <a
            v-else
            :href="plan.ctaHref"
            class="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-800 transition hover:bg-surface-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-surface-100 dark:hover:bg-white/[0.06]"
          >
            {{ plan.ctaLabel }}
            <ArrowRight class="size-4" />
          </a>
        </article>
      </section>

      <section class="mt-14 border-t border-surface-200 pt-8 dark:border-white/[0.08]">
        <div class="grid gap-6 text-sm leading-6 text-surface-600 dark:text-surface-300 md:grid-cols-3">
          <p>
            <strong class="text-surface-950 dark:text-white">No per-seat pricing.</strong>
            Invite the whole hiring team without turning collaboration into a billable event.
          </p>
          <p>
            <strong class="text-surface-950 dark:text-white">Self-hosting stays free.</strong>
            The community build remains open source for teams that want full control.
          </p>
          <p>
            <strong class="text-surface-950 dark:text-white">Cloud is optional.</strong>
            Hosted plans add managed operations, branding, integrations, and compliance features.
          </p>
        </div>
      </section>
    </main>
  </div>
</template>
