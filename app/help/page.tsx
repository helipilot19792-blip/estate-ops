"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

function HelpCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#e7ddd0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)] md:p-7">
      {eyebrow ? (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#8a7b68]">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-[#241c15]">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-[#6f6255]">{children}</div>
    </section>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#241c15] text-sm font-semibold text-[#f8f2e8]">
          {number}
        </div>
        <div>
          <div className="text-base font-semibold text-[#241c15]">{title}</div>
          <p className="mt-1 text-sm leading-6 text-[#6f6255]">{text}</p>
        </div>
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item}
          className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export default function HelpPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)]">
          <section className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="bg-[linear-gradient(135deg,#1f1812_0%,#2a2119_55%,#3a2c1d_100%)] px-6 py-8 text-white md:px-10 md:py-12">
              <div className="max-w-xl">
                <div className="mb-6 inline-flex rounded-[24px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                  <Image
                    src="/guleraoslogo.png"
                    alt="Gulera OS"
                    width={360}
                    height={140}
                    className="h-auto w-[220px] max-w-full"
                    priority
                  />
                </div>

                <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                  Gulera OS Help Center
                </div>

                <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                  Clear answers for daily operations.
                </h1>

                <p className="mt-5 max-w-lg text-sm leading-7 text-[#e7dccb] md:text-base">
                  Everything you need to get properties set up, calendars connected, staff assigned,
                  and jobs flowing smoothly across the platform.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => router.push("/admin")}
                    className="inline-flex items-center justify-center rounded-full bg-[#f3dfb2] px-5 py-3 text-sm font-medium text-[#241c15] transition hover:bg-[#ead39d]"
                  >
                    Back to Admin
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Go to Login
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-[#fcfaf7] px-6 py-8 md:px-10 md:py-12">
              <div className="grid gap-4">
                <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                    Most common setup path
                  </div>
                  <div className="mt-3 text-lg font-semibold text-[#241c15]">
                    Property → Calendars → Staff → Jobs
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6f6255]">
                    Most admins should start by creating a property, connecting all booking calendars,
                    linking cleaner and grounds staff, and then reviewing incoming jobs.
                  </p>
                </div>

                <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                    Calendar feeds
                  </div>
                  <div className="mt-3 text-lg font-semibold text-[#241c15]">
                    More than Airbnb and VRBO
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6f6255]">
                    You can add multiple feeds per property, including Airbnb, VRBO, Booking.com,
                    direct booking systems, Hospitable, OwnerRez, Guesty, Lodgify, or any custom iCal link.
                  </p>
                </div>

                <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                    Support
                  </div>
                  <div className="mt-3 text-lg font-semibold text-[#241c15]">
                    Built-in help when something breaks
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6f6255]">
                    Use the Support button in the portal to report issues, questions, or unexpected behavior.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6">
          <HelpCard eyebrow="Quick Start" title="Get up and running">
            <div className="grid gap-4 md:grid-cols-2">
              <Step
                number="1"
                title="Create your first property"
                text="Start in the Properties area. Add the property name, full address, internal notes, and owner details if you want owner access connected from the start."
              />
              <Step
                number="2"
                title="Add booking calendars"
                text="Under Booking Calendars, add as many calendar feeds as you need for the same property. Use a clear source name and paste the full iCal/ICS URL."
              />
              <Step
                number="3"
                title="Assign your teams"
                text="Link cleaner and grounds staff to the property so new jobs can flow to the right people without manual scrambling."
              />
              <Step
                number="4"
                title="Review jobs and alerts"
                text="Use the dashboard to monitor upcoming work, overdue items, stranded jobs, and maintenance flags."
              />
            </div>
          </HelpCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <HelpCard eyebrow="Admin" title="Admin guide">
              <BulletList
                items={[
                  "Create and manage properties across your organization.",
                  "Connect multiple booking calendars to a property from different platforms.",
                  "Assign cleaners and grounds staff to the right properties.",
                  "Review waiting, overdue, and stranded jobs from the dashboard.",
                  "Track maintenance flags, support requests, and operational issues.",
                ]}
              />
            </HelpCard>

            <HelpCard eyebrow="Calendars" title="How to add booking calendars">
              <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <div className="text-base font-semibold text-[#241c15]">Supported examples</div>
                <p className="mt-2 text-sm leading-6 text-[#6f6255]">
                  Airbnb, VRBO, Booking.com, direct booking systems, Hospitable, OwnerRez,
                  Guesty, Lodgify, or any custom iCal calendar feed.
                </p>
              </div>

              <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <div className="text-base font-semibold text-[#241c15]">How to add one</div>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                    Enter a source name such as Airbnb, Booking.com, Direct, or Custom.
                  </div>
                  <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                    Paste the full iCal or ICS link from that platform.
                  </div>
                  <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                    Leave Active checked if you want it to sync.
                  </div>
                  <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                    Click Add Calendar, then Save Calendars.
                  </div>
                </div>
              </div>
            </HelpCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <HelpCard eyebrow="Cleaner" title="Cleaner guide">
              <BulletList
                items={[
                  "View available jobs assigned through the cleaner workflow.",
                  "Accept a job when you are ready to take it on.",
                  "Use access notes and SOP notes to complete work correctly.",
                  "Update or complete the job when work is finished.",
                  "Report issues when something is missing, damaged, or needs attention.",
                ]}
              />
            </HelpCard>

            <HelpCard eyebrow="Grounds & Maintenance" title="Grounds guide">
              <BulletList
                items={[
                  "View assigned grounds or recurring maintenance work.",
                  "Complete scheduled services such as lawn care, cleanup, or exterior checks.",
                  "Review property notes and access details when needed.",
                  "Track maintenance-related follow-up and unresolved property issues.",
                  "Report anything urgent so admins can respond quickly.",
                ]}
              />
            </HelpCard>
          </div>

          <HelpCard eyebrow="Support" title="Need help?">
            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <p className="text-sm leading-7 text-[#6f6255]">
                Use the Support button in the portal whenever something is unclear, broken,
                or not behaving the way you expect. Support requests are saved directly inside the system
                so admins can respond and keep operations moving.
              </p>
            </div>
          </HelpCard>
        </div>
      </div>
    </main>
  );
}