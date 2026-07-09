import Link from "next/link";
import RootAuthRedirect from "@/components/marketing/root-auth-redirect";
import {
  foundingOffer,
  marketingFaqs,
  marketingFeatures,
  marketingHeroStats,
  marketingPlans,
} from "@/lib/marketing";

export default function Home() {
  const starterPlan = marketingPlans.find((plan) => plan.featured) ?? marketingPlans[0];

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#241c15]">
      <RootAuthRedirect />

      <div className="border-b border-[#e7ddd0] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#9f7a38]">
              Estate of Mind
            </div>
            <div className="text-lg font-semibold tracking-tight">Operations platform for STR teams</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-[#dccfbf] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fbf6ef]"
            >
              Log in
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-[#dccfbf] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fbf6ef]"
            >
              Pricing
            </Link>
            <Link
              href="/help"
              className="rounded-full border border-[#dccfbf] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fbf6ef]"
            >
              Help
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-[#241c15] px-5 py-2 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#382d23]"
            >
              Create company
            </Link>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-8 md:px-6 md:pb-12 md:pt-10">
        <div className="overflow-hidden rounded-[38px] border border-[#e7ddd0] bg-[linear-gradient(135deg,#1d1712_0%,#2a2119_52%,#efe0c3_180%)] shadow-[0_30px_90px_rgba(36,28,21,0.18)]">
          <div className="grid gap-10 px-6 py-8 md:px-10 md:py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="text-white">
              <div className="inline-flex rounded-full border border-[#f3ddb2]/30 bg-[#f0d39d]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f6e4bf]">
                Launch pricing now live
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
                Run properties, staff, jobs, and owner communication from one clean system.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#ebdecb] md:text-lg">
                Estate of Mind helps property managers and cleaning companies replace scattered tools
                with one practical operations hub for admin, cleaners, grounds, and owners.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-full bg-[#f3dfb2] px-6 py-3 text-sm font-semibold text-[#241c15] transition hover:bg-[#ead39d]"
                >
                  Log in to your portal
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                >
                  Start your 30-day free trial
                </Link>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#dfd1bc]">
                Cleaners, grounds, and owners should use <span className="font-semibold text-white">Log in</span>. Only company admins should start a free trial.
              </p>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                {marketingHeroStats.map((stat) => (
                  <div key={stat.label} className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4">
                    <div className="text-2xl font-semibold text-white">{stat.value}</div>
                    <div className="mt-1 text-sm leading-6 text-[#dfd1bc]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-[#e7cfaa] bg-[#fff8ea] p-6 text-[#241c15] shadow-[0_18px_45px_rgba(0,0,0,0.16)] md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9f7a38]">
                    {starterPlan.badge}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">{starterPlan.name}</h2>
                </div>
                <div className="rounded-full border border-[#ead3ab] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
                  {starterPlan.properties}
                </div>
              </div>

              <div className="mt-5 flex items-end gap-2">
                <div className="text-5xl font-semibold tracking-tight">{starterPlan.price}</div>
                <div className="pb-1 text-sm text-[#6f6255]">{starterPlan.cadence}</div>
              </div>

              <p className="mt-4 text-sm leading-7 text-[#5f5245]">{starterPlan.summary}</p>

              <div className="mt-5 grid gap-3">
                {starterPlan.details.map((detail) => (
                  <div
                    key={detail}
                    className="rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#4c4136]"
                  >
                    {detail}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[22px] border border-[#efd8a8] bg-[#fff3d7] px-4 py-4">
                <div className="text-sm font-semibold text-[#241c15]">{foundingOffer.title}</div>
                <div className="mt-1 text-lg font-semibold text-[#8a6a35]">{foundingOffer.price}</div>
                <p className="mt-2 text-sm leading-6 text-[#5f5245]">{foundingOffer.body}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {marketingFeatures.map((feature) => (
            <div
              key={feature.title}
              className="rounded-[28px] border border-[#e7ddd0] bg-white p-6 shadow-[0_16px_34px_rgba(0,0,0,0.05)]"
            >
              <h2 className="text-xl font-semibold tracking-tight text-[#241c15]">{feature.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#66594c]">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[32px] border border-[#d7c6ae] bg-[#241c15] p-7 text-white shadow-[0_24px_60px_rgba(36,28,21,0.14)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d9c6a3]">
              Why teams switch
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Smaller operators need simpler pricing and stronger workflow.
            </h2>
            <p className="mt-4 text-sm leading-8 text-[#eadfce]">
              Most competitors price small companies out early or force them into disconnected tools.
              Estate of Mind stays practical: fair entry pricing, role-based portals, and one place to
              run the operation.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {marketingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-[28px] border p-5 shadow-[0_14px_34px_rgba(0,0,0,0.05)] ${
                  plan.featured
                    ? "border-[#e5c98f] bg-[#fff8ea]"
                    : "border-[#e7ddd0] bg-white"
                }`}
              >
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
                  {plan.name}
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-[#241c15]">{plan.price}</div>
                <div className="mt-1 text-sm text-[#6f6255]">{plan.cadence}</div>
                <div className="mt-4 text-sm font-medium text-[#241c15]">{plan.properties}</div>
                <p className="mt-3 text-sm leading-7 text-[#66594c]">{plan.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <div className="rounded-[34px] border border-[#e7ddd0] bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9f7a38]">
                FAQ
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#241c15]">
                Questions people usually ask before signing up
              </h2>
            </div>
            <Link
              href="/pricing"
              className="rounded-full border border-[#dccfbf] px-5 py-3 text-sm font-medium text-[#5f5245] transition hover:bg-[#fbf6ef]"
            >
              Full pricing details
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {marketingFaqs.map((faq) => (
              <div key={faq.question} className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <h3 className="text-base font-semibold text-[#241c15]">{faq.question}</h3>
                <p className="mt-2 text-sm leading-7 text-[#66594c]">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
