import Link from "next/link";

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-10 text-[#241c15]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-[#e7ddd0] bg-white p-6 shadow-[0_24px_70px_rgba(36,28,21,0.08)] sm:p-8">
        <div className="text-xs uppercase tracking-[0.24em] text-[#8a6a35]">Gulera OS</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Cookie Notice</h1>
        <p className="mt-2 text-sm text-[#7f7263]">Testing-phase draft. Last updated May 4, 2026.</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#4f4338]">
          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Essential Cookies and Storage</h2>
            <p className="mt-2">
              Gulera OS uses essential cookies and local browser storage for login sessions, security,
              saved preferences, portal navigation, and features the user requests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Optional Tools</h2>
            <p className="mt-2">
              Optional analytics, marketing, or tracking tools should not be enabled unless the user has
              consented. During testing, this notice is designed to support that separation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Changing Your Choice</h2>
            <p className="mt-2">
              To reset the cookie banner, clear this site&apos;s browser data for Gulera OS and reload
              the page. A future release should add a dedicated cookie preferences button.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Related Policies</h2>
            <p className="mt-2">
              Read the{" "}
              <Link href="/terms" className="font-semibold text-[#7d581b] underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-semibold text-[#7d581b] underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
