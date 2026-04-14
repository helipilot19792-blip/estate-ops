"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type HelpSectionKey =
  | "getting-started"
  | "properties"
  | "calendars"
  | "staffing"
  | "jobs"
  | "maintenance"
  | "support";

const SECTION_ORDER: HelpSectionKey[] = [
  "getting-started",
  "properties",
  "calendars",
  "staffing",
  "jobs",
  "maintenance",
  "support",
];

const SECTION_LABELS: Record<HelpSectionKey, string> = {
  "getting-started": "Getting Started",
  properties: "Properties",
  calendars: "Calendars",
  staffing: "Staffing",
  jobs: "Jobs",
  maintenance: "Maintenance",
  support: "Support",
};

function NavPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-[#241c15] text-[#f8f2e8]"
          : "bg-white text-[#5f5245] border border-[#e7ddd0] hover:bg-[#fcfaf7]"
      }`}
    >
      {label}
    </button>
  );
}

function QuickTile({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#e7ddd0] bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
      <div className="text-base font-semibold text-[#241c15]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[#6f6255]">{text}</p>
    </div>
  );
}

function Checklist({
  items,
}: {
  items: string[];
}) {
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

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)] md:p-7">
      {eyebrow ? (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a7b68]">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-[#241c15]">{title}</h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function MiniStep({
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b48d4e] text-sm font-semibold text-white">
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

export default function HelpPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<HelpSectionKey>("getting-started");

  const sectionContent = useMemo(() => {
    switch (activeSection) {
      case "getting-started":
        return (
          <SectionCard eyebrow="Launch" title="Start here first">
            <div className="grid gap-4 md:grid-cols-2">
              <MiniStep
                number="1"
                title="Create a property"
                text="Add the property name, address, notes, and owner details first. This creates the base record for everything else."
              />
              <MiniStep
                number="2"
                title="Connect booking calendars"
                text="Attach all iCal feeds that belong to that property so bookings and turnover timing stay accurate."
              />
              <MiniStep
                number="3"
                title="Assign your teams"
                text="Link cleaner and grounds accounts to the property so new jobs can route properly."
              />
              <MiniStep
                number="4"
                title="Monitor the dashboard"
                text="Use alerts, job counts, and maintenance flags to stay on top of daily operations."
              />
            </div>

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <div className="text-base font-semibold text-[#241c15]">Fastest setup path</div>
              <p className="mt-2 text-sm leading-7 text-[#6f6255]">
                Property setup, then booking calendars, then staffing, then jobs. That is the cleanest
                way to bring a new property into Gulera OS without causing downstream confusion.
              </p>
            </div>
          </SectionCard>
        );

      case "properties":
        return (
          <SectionCard eyebrow="Properties" title="Managing properties">
            <Checklist
              items={[
                "Create each property before trying to assign staff or attach calendars.",
                "Use the full address so the property is easy to identify throughout the system.",
                "Add internal notes that help your team understand quirks, special instructions, or site rules.",
                "Link the owner from the start if you want owner portal access set up properly.",
              ]}
            />

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <div className="text-base font-semibold text-[#241c15]">Best practice</div>
              <p className="mt-2 text-sm leading-7 text-[#6f6255]">
                Think of the property record as the foundation. If that setup is clean, everything else
                becomes easier: cleaner assignments, grounds work, booking feeds, SOP notes, and access details.
              </p>
            </div>
          </SectionCard>
        );

      case "calendars":
        return (
          <SectionCard eyebrow="Calendars" title="Connecting booking calendars">
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <div className="text-base font-semibold text-[#241c15]">Supported examples</div>
                <div className="mt-3 grid gap-2 text-sm text-[#5f5245]">
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Airbnb</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">VRBO</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Booking.com</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Hospitable</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">OwnerRez</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Guesty</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Lodgify</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Direct booking systems</div>
                  <div className="rounded-[14px] border border-[#eadfce] bg-white px-4 py-3">Custom iCal feed</div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <div className="text-base font-semibold text-[#241c15]">How to add one</div>
                <div className="mt-4 grid gap-3">
                  <MiniStep
                    number="1"
                    title="Choose a clear source name"
                    text="Examples: Airbnb, Booking.com, Direct, or Custom."
                  />
                  <MiniStep
                    number="2"
                    title="Paste the full iCal or ICS URL"
                    text="Use the full calendar feed link from the platform you want to sync."
                  />
                  <MiniStep
                    number="3"
                    title="Leave Active enabled"
                    text="This tells the system the feed should be used."
                  />
                  <MiniStep
                    number="4"
                    title="Add and save"
                    text="Click Add Calendar, then Save Calendars to keep the feed attached to the property."
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
              <div className="text-base font-semibold text-[#241c15]">Important note</div>
              <p className="mt-2 text-sm leading-7 text-[#6f6255]">
                You can add multiple calendar feeds to the same property. Gulera OS is not limited to Airbnb and VRBO.
                If a platform can provide an iCal feed, it can be used here.
              </p>
            </div>
          </SectionCard>
        );

      case "staffing":
        return (
          <SectionCard eyebrow="Staffing" title="Cleaner and grounds setup">
            <Checklist
              items={[
                "Create cleaner accounts for cleaning teams and grounds accounts for exterior or maintenance crews.",
                "Link staff members to those accounts so jobs can flow to the right people.",
                "Assign accounts to properties in priority order.",
                "Use assignments to avoid manual job routing every time a booking comes in.",
              ]}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <QuickTile
                title="Cleaner side"
                text="Use cleaner accounts for turnover and interior task flow. Cleaners should be linked before relying on auto-routing."
              />
              <QuickTile
                title="Grounds side"
                text="Use grounds accounts for lawn care, seasonal work, recurring exterior tasks, and maintenance-related dispatching."
              />
            </div>
          </SectionCard>
        );

      case "jobs":
        return (
          <SectionCard eyebrow="Jobs" title="Daily operations and job flow">
            <Checklist
              items={[
                "Use the dashboard alerts to spot waiting, overdue, and stranded jobs quickly.",
                "Turnover jobs depend on properties, calendars, and staffing all being set up correctly.",
                "Grounds jobs can be scheduled manually or built from recurring work rules.",
                "If something is not routing properly, check the property, assignment, and membership links first.",
              ]}
            />

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <div className="text-base font-semibold text-[#241c15]">When jobs look wrong</div>
              <p className="mt-2 text-sm leading-7 text-[#6f6255]">
                Most job issues come from missing property setup, missing team assignments, or missing calendar feeds.
                Gulera OS usually reflects the setup beneath it, so fix the structure first before chasing the symptom.
              </p>
            </div>
          </SectionCard>
        );

      case "maintenance":
        return (
          <SectionCard eyebrow="Maintenance" title="Flags and follow-up">
            <Checklist
              items={[
                "Use maintenance flags to track issues that need attention outside normal turnover flow.",
                "Keep notes specific so admins and staff know what needs to be done.",
                "Use urgency levels properly so the dashboard reflects what matters most.",
                "Resolved items should be closed cleanly so open counts stay meaningful.",
              ]}
            />
          </SectionCard>
        );

      case "support":
        return (
          <SectionCard eyebrow="Support" title="When you need help">
            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <div className="text-base font-semibold text-[#241c15]">Built into the platform</div>
              <p className="mt-2 text-sm leading-7 text-[#6f6255]">
                Use the Support button inside Gulera OS whenever something is unclear, broken, or not behaving as expected.
                Support requests are captured in the system so they can be reviewed and acted on properly.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <QuickTile
                title="Good support request"
                text="Describe what page you were on, what you clicked, and what you expected to happen."
              />
              <QuickTile
                title="Best detail to include"
                text="Property name, job type, and whether it affected cleaners, grounds, or admin workflow."
              />
              <QuickTile
                title="Fastest resolution"
                text="Short, specific descriptions are easier to diagnose than long vague explanations."
              />
            </div>
          </SectionCard>
        );

      default:
        return null;
    }
  }, [activeSection]);

  return (
    <main className="min-h-screen bg-[#f5f1ea] text-[#241c15]">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)]">
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="border-b border-[#e7ddd0] bg-[linear-gradient(180deg,#1f1812_0%,#2a2119_60%,#33261a_100%)] px-5 py-6 text-white lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
              <div className="rounded-[24px] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                <Image
                  src="/guleraoslogo.png"
                  alt="Gulera OS"
                  width={320}
                  height={120}
                  className="h-auto w-full"
                  priority
                />
              </div>

              <div className="mt-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d8c7ab]">
                  Help Center
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                  Operations guidance, organized.
                </h1>
                <p className="mt-3 text-sm leading-7 text-[#e7dccb]">
                  Quick answers for setup, calendars, staffing, jobs, maintenance, and support.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/admin")}
                  className="rounded-full bg-[#f3dfb2] px-4 py-2 text-sm font-medium text-[#241c15] transition hover:bg-[#ead39d]"
                >
                  Back to Admin
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Go to Login
                </button>
              </div>

              <div className="mt-8 grid gap-2">
                {SECTION_ORDER.map((section) => (
                  <NavPill
                    key={section}
                    active={activeSection === section}
                    label={SECTION_LABELS[section]}
                    onClick={() => setActiveSection(section)}
                  />
                ))}
              </div>
            </aside>

            <section className="bg-[#fcfaf7] p-4 md:p-6 lg:p-8">
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <QuickTile
                  title="Best starting point"
                  text="Set up the property first. Everything else works better when the property record is clean."
                />
                <QuickTile
                  title="Calendar support"
                  text="Airbnb, VRBO, Booking.com, direct booking, and custom iCal feeds are all supported."
                />
                <QuickTile
                  title="Use support early"
                  text="If something looks off, send a support request before bad setup spreads into operations."
                />
              </div>

              {sectionContent}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}