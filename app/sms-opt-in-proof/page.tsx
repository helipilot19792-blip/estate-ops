import Link from "next/link";

const LIVE_FLOW_LINKS = [
  {
    title: "Primary web signup flow",
    href: "https://portal.estateofmindpm.com/login",
    detail:
      "Public account creation flow showing the phone number field, standalone SMS consent checkbox, and legal links.",
  },
  {
    title: "Terms of Use",
    href: "https://portal.estateofmindpm.com/terms",
    detail: "Public SMS terms referenced from the signup and invite flows.",
  },
  {
    title: "Privacy Policy",
    href: "https://portal.estateofmindpm.com/privacy",
    detail: "Public privacy policy referenced from the signup and invite flows.",
  },
  {
    title: "Cookie Notice",
    href: "https://portal.estateofmindpm.com/cookies",
    detail: "Public cookie notice referenced from the signup and invite flows.",
  },
] as const;

const CONSENT_POINTS = [
  "Users enter a phone number in the Gulera OS signup or invite flow.",
  "Users must actively select a standalone SMS consent checkbox before continuing.",
  "The consent text appears on the same screen as the phone field and signup action.",
  "The flow links directly to the public Terms of Use and Privacy Policy pages.",
  "Messages are strictly operational and transactional. Marketing SMS is not sent.",
] as const;

const CONSENT_COPY =
  "I understand Gulera OS is in testing and agree to receive operational SMS notifications about invites, account access, jobs, property updates, owner invoices, and maintenance. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out. I also agree to the Terms, Privacy Policy, and Cookie Notice.";

const USE_CASE_DESCRIPTION =
  "Estate of Mind Property Management uses Gulera OS to send transactional SMS messages to staff, owners, and invited users who create an account or accept an invite and expressly opt in on a web form. Consent is collected through a standalone SMS checkbox displayed with the phone number field and disclosure text. Messages are strictly operational, not marketing, and include account access alerts, cleaner job offers, schedule changes, maintenance updates, and owner invoice reminders. Message frequency varies by account activity.";

const SAMPLE_MESSAGE =
  "Estate of Mind PM via Gulera OS: New cleaning job available for Peaceful Rustic Cabin on Jul 8. Open the portal to accept or decline. Reply STOP to opt out or HELP for help.";

export default function SmsOptInProofPage() {
  return (
    <main className="min-h-screen bg-[#f6f3ec] px-4 py-10 text-[#241c15]">
      <article className="mx-auto max-w-5xl rounded-[32px] border border-[#e7ddd0] bg-white p-6 shadow-[0_24px_80px_rgba(36,28,21,0.08)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a6a35]">
              Estate of Mind Property Management
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              SMS Opt-In Proof
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#5f5245] sm:text-base">
              This page documents the live Gulera OS web-form consent flow used by Estate of Mind
              Property Management for low-volume operational SMS alerts. It is provided for toll-free
              verification review.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] px-5 py-4 text-sm text-[#5f5245]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
              Review summary
            </div>
            <div className="mt-2 leading-6">
              Web-form opt-in only.
              <br />
              Transactional messaging only.
              <br />
              Terms and Privacy links are public.
            </div>
          </div>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
              Consent workflow
            </div>
            <ol className="mt-4 space-y-3 text-sm leading-7 text-[#4f4338]">
              {CONSENT_POINTS.map((point, index) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#241c15] text-xs font-semibold text-[#f8f2e8]">
                    {index + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[28px] border border-[#d8e4ef] bg-[#f8fbff] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3563a8]">
              Live proof links
            </div>
            <div className="mt-4 space-y-4">
              {LIVE_FLOW_LINKS.map((item) => (
                <div key={item.href} className="rounded-[22px] border border-[#d9e6f7] bg-white p-4">
                  <div className="text-sm font-semibold text-[#17202a]">{item.title}</div>
                  <div className="mt-1 text-sm leading-6 text-[#5f6f86]">{item.detail}</div>
                  <Link
                    href={item.href}
                    className="mt-3 inline-flex text-sm font-semibold text-[#2957a4] underline underline-offset-4"
                  >
                    {item.href}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[28px] border border-[#eadfce] bg-white p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
              Consent text shown to users
            </div>
            <div className="mt-4 rounded-[22px] border border-[#e7ddd0] bg-[#fcfaf7] p-4 text-sm leading-7 text-[#4f4338]">
              {CONSENT_COPY}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#eadfce] bg-white p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
              Transactional sample message
            </div>
            <div className="mt-4 rounded-[22px] border border-[#e7ddd0] bg-[#fcfaf7] p-4 text-sm leading-7 text-[#4f4338]">
              {SAMPLE_MESSAGE}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
            Use case description
          </div>
          <div className="mt-4 text-sm leading-7 text-[#4f4338]">{USE_CASE_DESCRIPTION}</div>
        </section>

        <section className="mt-8 rounded-[28px] border border-[#d7e7d7] bg-[#f5fbf5] p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2f6b2f]">
            Notes for reviewers
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-[#325032]">
            <li>SMS is used for operational property-management updates only.</li>
            <li>No promotional or marketing campaigns are sent from this number.</li>
            <li>Recipients are existing users, invited staff, or owners with an existing business relationship.</li>
            <li>Users can opt out at any time by replying STOP and request help by replying HELP.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
