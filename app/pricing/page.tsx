import Link from "next/link";
import { foundingOffer, marketingFaqs, marketingPlans } from "@/lib/marketing";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#241c15]">
      <div className="border-b border-[#e7ddd0] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#9f7a38]">
              Estate of Mind
            </div>
            <div className="text-lg font-semibold tracking-tight">Pricing</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#dccfbf] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fbf6ef]"
            >
              Home
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
              Start free trial
            </Link>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-8 md:px-6 md:pb-12 md:pt-10">
        <div className="rounded-[38px] border border-[#e7ddd0] bg-[linear-gradient(135deg,#fffdfa_0%,#f7f0e2_100%)] p-7 shadow-[0_28px_70px_rgba(0,0,0,0.06)] md:p-10">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9f7a38]">
              Launch pricing
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Straightforward pricing that stays friendly for smaller operators.
            </h1>
            <p className="mt-4 text-base leading-8 text-[#66594c]">
              Start at $20 CAD per month for up to 10 properties, grow to $40 CAD per month for up
              to 25, and move to custom pricing only when your portfolio actually needs it.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-2 md:px-6 md:py-4">
        <div className="grid gap-5 lg:grid-cols-3">
          {marketingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-[32px] border p-6 shadow-[0_18px_38px_rgba(0,0,0,0.05)] ${
                plan.featured
                  ? "border-[#e5c98f] bg-[#fff8ea]"
                  : "border-[#e7ddd0] bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8a6a35]">
                  {plan.name}
                </div>
                {plan.badge ? (
                  <div className="rounded-full border border-[#e6cfaa] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
                    {plan.badge}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex items-end gap-2">
                <div className="text-5xl font-semibold tracking-tight text-[#241c15]">{plan.price}</div>
                <div className="pb-1 text-sm text-[#6f6255]">{plan.cadence}</div>
              </div>

              <div className="mt-4 rounded-full border border-[#eadfce] bg-white px-4 py-2 text-sm font-medium text-[#4c4136]">
                {plan.properties}
              </div>

              <p className="mt-4 text-sm leading-7 text-[#66594c]">{plan.summary}</p>

              <div className="mt-5 grid gap-3">
                {plan.details.map((detail) => (
                  <div
                    key={detail}
                    className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#4c4136]"
                  >
                    {detail}
                  </div>
                ))}
              </div>

              <Link
                href="/login"
                className={`mt-6 inline-flex rounded-full px-5 py-3 text-sm font-semibold transition ${
                  plan.featured
                    ? "bg-[#241c15] text-[#f8f2e8] hover:bg-[#382d23]"
                    : "border border-[#dccfbf] text-[#5f5245] hover:bg-[#fbf6ef]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="rounded-[32px] border border-[#e7ddd0] bg-[#241c15] p-7 text-white shadow-[0_24px_60px_rgba(36,28,21,0.14)] md:p-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d9c6a3]">
                Annual option
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{foundingOffer.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-8 text-[#eadfce]">{foundingOffer.body}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 px-6 py-5 text-center">
              <div className="text-sm uppercase tracking-[0.2em] text-[#d9c6a3]">Founding rate</div>
              <div className="mt-2 text-4xl font-semibold">{foundingOffer.price}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <div className="rounded-[34px] border border-[#e7ddd0] bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] md:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9f7a38]">
            FAQ
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#241c15]">
            Pricing questions, answered clearly
          </h2>

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
