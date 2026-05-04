import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-10 text-[#241c15]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-[#e7ddd0] bg-white p-6 shadow-[0_24px_70px_rgba(36,28,21,0.08)] sm:p-8">
        <div className="text-xs uppercase tracking-[0.24em] text-[#8a6a35]">Gulera OS</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Terms of Use</h1>
        <p className="mt-2 text-sm text-[#7f7263]">Testing-phase draft. Last updated May 4, 2026.</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#4f4338]">
          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Beta Testing Notice</h2>
            <p className="mt-2">
              Gulera OS is currently being tested. Features may change, data displays may be adjusted,
              and errors may occur. Users should verify important operational, financial, or invoice
              information before relying on it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Permitted Use</h2>
            <p className="mt-2">
              The portal is provided for property operations, owner communication, job coordination,
              maintenance tracking, and invoice workflow testing. Users are responsible for keeping
              login credentials secure and for using the system only for authorized business purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">No Professional Advice</h2>
            <p className="mt-2">
              The software may help prepare operational records, reports, invoices, or exports, but it
              does not provide legal, accounting, tax, or financial advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Availability and Changes</h2>
            <p className="mt-2">
              Access may be interrupted during testing, maintenance, deployment, or troubleshooting.
              Features may be added, removed, or changed as the product improves.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Privacy</h2>
            <p className="mt-2">
              Use of the portal is also subject to the{" "}
              <Link href="/privacy" className="font-semibold text-[#7d581b] underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/cookies" className="font-semibold text-[#7d581b] underline">
                Cookie Notice
              </Link>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
