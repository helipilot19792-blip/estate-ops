import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-10 text-[#241c15]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-[#e7ddd0] bg-white p-6 shadow-[0_24px_70px_rgba(36,28,21,0.08)] sm:p-8">
        <div className="text-xs uppercase tracking-[0.24em] text-[#8a6a35]">Gulera OS</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#7f7263]">Testing-phase draft. Last updated May 4, 2026.</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#4f4338]">
          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Information Collected</h2>
            <p className="mt-2">
              The portal may store names, email addresses, phone numbers, company details, property
              information, job records, maintenance notes, photos, owner invoices, receipts, and login
              or security information needed to operate the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">How Information Is Used</h2>
            <p className="mt-2">
              Information is used to provide property operations tools, send invites and notifications,
              coordinate cleaning or grounds work, manage owner communication, generate invoices, and
              improve reliability during testing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Service Providers</h2>
            <p className="mt-2">
              The system uses third-party infrastructure providers for hosting, database, file storage,
              authentication, and email delivery. These providers process information only as needed to
              run the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Testing Phase</h2>
            <p className="mt-2">
              During testing, administrators may review submitted information and error reports to
              troubleshoot issues, verify workflows, and improve the product.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#241c15]">Choices and Questions</h2>
            <p className="mt-2">
              Users can request corrections, account changes, or removal where appropriate by contacting
              the organization that invited them. Cookie choices are described in the{" "}
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
