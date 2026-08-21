"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { useState } from "react";

type DemoView = "today" | "properties" | "owners";

const properties = [
  { name: "Bluewater Lake House", city: "Collingwood", status: "Turnover tomorrow", tone: "amber" },
  { name: "Maple Street Loft", city: "Toronto", status: "Guest in house", tone: "green" },
  { name: "Harbourview Condo", city: "Barrie", status: "Ready for arrival", tone: "blue" },
  { name: "Pine Ridge Cabin", city: "Muskoka", status: "Maintenance open", tone: "red" },
];

const navItems: Array<{ id: DemoView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "owners", label: "Owners & billing", icon: ReceiptText },
];

function StatusDot({ tone }: { tone: string }) {
  const className =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "blue"
        ? "bg-sky-500"
        : tone === "red"
          ? "bg-rose-500"
          : "bg-amber-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${className}`} />;
}

export default function DemoPage() {
  const [view, setView] = useState<DemoView>("today");

  return (
    <main className="min-h-screen bg-[#eee8df] text-[#241c15]">
      <div className="border-b border-[#ddd1c3] bg-[#f8f5f0] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8ccbe] bg-white text-[#5f5245] transition hover:bg-[#f4eee6]"
              aria-label="Back to login"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={15} className="text-[#a9782e]" aria-hidden="true" />
                Guided portfolio demo
              </div>
              <div className="text-xs text-[#817466]">Sample data · nothing you do here changes a real account</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full border border-[#d8ccbe] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5245] sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=company"
              className="inline-flex items-center gap-2 rounded-full bg-[#241c15] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#372a20]"
            >
              Start free trial <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-0 p-3 sm:p-5 lg:grid-cols-[245px_1fr]">
        <aside className="overflow-hidden rounded-t-[28px] bg-[#211912] text-white lg:min-h-[calc(100vh-112px)] lg:rounded-l-[28px] lg:rounded-tr-none">
          <div className="flex items-center gap-4 border-b border-white/10 p-4 lg:block lg:p-5">
            <div className="w-[118px] shrink-0 rounded-[17px] bg-white px-3 py-3 lg:w-auto">
              <Image src="/guleraoslogo.png" alt="Gulera OS" width={260} height={110} className="h-auto w-[95px] lg:w-[155px]" priority />
            </div>
            <div className="min-w-0 lg:mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c8b79f] lg:text-[11px] lg:tracking-[0.2em]">Demo workspace</div>
              <div className="mt-1 truncate text-sm font-semibold lg:text-base">North Shore Stays</div>
              <div className="mt-1 text-xs text-[#c8b79f]">4-property portfolio</div>
            </div>
          </div>

          <nav className="grid gap-1 p-3 sm:grid-cols-3 lg:grid-cols-1" aria-label="Demo sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`flex items-center gap-3 rounded-[16px] px-3 py-3 text-left text-sm transition ${
                    active ? "bg-[#f2d69e] font-semibold text-[#241c15]" : "text-[#e8ded1] hover:bg-white/8"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mx-4 mb-4 hidden rounded-[20px] border border-white/10 bg-white/5 p-4 lg:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#f4d99f]">
              <ShieldCheck size={15} aria-hidden="true" /> Read-only demo
            </div>
            <p className="mt-2 text-xs leading-5 text-[#c8b79f]">
              A real workspace adds secure staff and owner portals, live calendar sync, and your own property data.
            </p>
          </div>
        </aside>

        <section className="rounded-b-[28px] bg-[#f8f5f0] p-3 sm:p-5 lg:rounded-bl-none lg:rounded-r-[28px] lg:p-6">
          {view === "today" ? (
            <TodayView />
          ) : (
            <>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7438]">Small portfolio command centre</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                    {view === "properties" ? "Every property, properly organized." : "Owner reporting without the spreadsheet chase."}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#74685c] sm:text-base">
                    {view === "properties"
                      ? "Keep the details your team needs—from access codes and SOPs to schedules and maintenance—in one reliable place."
                      : "Create invoices, track what owners have viewed, and keep each property’s financial history close to its operations."}
                  </p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 size={16} aria-hidden="true" /> 3 of 4 properties on track
                </div>
              </div>

              {view === "properties" ? <PropertiesView /> : null}
              {view === "owners" ? <OwnersView /> : null}
            </>
          )}

          <div className="mt-6 flex flex-col gap-4 rounded-[24px] bg-[#241c15] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="text-lg font-semibold">This is what a four-property workday can look like.</div>
              <div className="mt-1 text-sm text-[#d8cbbc]">Starter supports up to 10 properties for $20 CAD/month after the 30-day trial.</div>
            </div>
            <Link href="/login?mode=company" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#f2d69e] px-5 py-3 text-sm font-semibold text-[#241c15]">
              Create your workspace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function TodayView() {
  const [showVacantProperties, setShowVacantProperties] = useState(false);
  const navigation = [
    ["Home", "blue"],
    ["Notifications", "amber"],
    ["Calendar", "teal"],
    ["Bookings", "purple"],
    ["Chat", "cyan"],
    ["Bulletin Board", "amber"],
    ["Jobs", "green"],
    ["Maintenance", "red"],
    ["Inspections", "amber"],
    ["Invoices", "orange"],
    ["Properties", "sky"],
    ["Assignments", "lime"],
    ["Documents", "purple"],
    ["Team", "violet"],
  ];
  const navTone: Record<string, string> = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    teal: "bg-teal-500",
    purple: "bg-violet-600",
    cyan: "bg-cyan-500",
    green: "bg-emerald-500",
    red: "bg-red-500",
    orange: "bg-orange-500",
    sky: "bg-sky-500",
    lime: "bg-lime-500",
    violet: "bg-violet-500",
  };
  const happenings = [
    {
      kind: "Cleaning",
      title: "Bluewater Lake House",
      detail: "Wasaga Beach · Cleaner: Maria Chen",
      tone: "blue",
      note: "Turnover cleaning · due by 3:00 PM",
    },
    {
      kind: "Check-in",
      title: "Bluewater Lake House",
      detail: "The Robinson family · 6 guests · Airbnb",
      tone: "purple",
      note: "Arrival today at 4:00 PM",
    },
    {
      kind: "Check-in",
      title: "Harbourview Condo",
      detail: "Maya Patel · 2 guests · Direct booking",
      tone: "purple",
      note: "Door code and welcome guide ready",
    },
    {
      kind: "Checkout",
      title: "Maple Street Loft",
      detail: "Daniel Brooks · 3 guests · Vrbo",
      tone: "amber",
      note: "Checkout today at 11:00 AM",
    },
    {
      kind: "Grounds",
      title: "Pine Ridge Cabin",
      detail: "Muskoka · Devon Price",
      tone: "green",
      note: "Hot tub and exterior check · 2:00 PM",
    },
  ];
  const happeningTone: Record<string, { badge: string; border: string; pill: string }> = {
    blue: { badge: "bg-blue-600", border: "border-blue-200", pill: "bg-blue-50 text-blue-700" },
    purple: { badge: "bg-violet-600", border: "border-violet-200", pill: "bg-violet-50 text-violet-700" },
    amber: { badge: "bg-amber-600", border: "border-amber-200", pill: "bg-amber-50 text-amber-800" },
    green: { badge: "bg-emerald-600", border: "border-emerald-200", pill: "bg-emerald-50 text-emerald-700" },
  };
  const occupied = [
    {
      property: "Bluewater Lake House",
      city: "Wasaga Beach",
      status: "Turnover today",
      checkout: "Robinson · 6 guests · out at 11:00 AM",
      checkin: "Foster · 4 guests · in at 4:00 PM",
      source: "AIRBNB",
    },
    {
      property: "Harbourview Condo",
      city: "Barrie",
      status: "Check-in today",
      checkin: "Maya Patel · 2 guests · in at 3:00 PM",
      source: "DIRECT",
    },
    {
      property: "Maple Street Loft",
      city: "Toronto",
      status: "Checkout today",
      checkout: "Daniel Brooks · 3 guests · out at 11:00 AM",
      source: "VRBO",
    },
  ];
  const vacant = [
    {
      property: "Maple Street Loft",
      city: "Toronto",
      status: "Vacant after checkout",
      availability: "Guests until checkout at 11:00 AM",
      departingGuest: "Daniel Brooks · 3 guests · Vrbo",
      nextArrival: "Tuesday, August 25 at 3:00 PM",
      guest: "S. Williams · 2 guests · Direct",
    },
    {
      property: "Pine Ridge Cabin",
      city: "Muskoka",
      status: "Vacant all day",
      availability: "No guest stay scheduled today",
      departingGuest: "",
      nextArrival: "Monday, August 24 at 4:00 PM",
      guest: "K. Thompson · 5 guests · Airbnb",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-[#e5d8c9] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(48,35,21,0.05)] sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={17} className="text-amber-600" /> Operations Alerts</div>
            <p className="mt-1 text-xs text-[#817466]">Important items across jobs and maintenance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">1 open maintenance flag</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">1 inspection due</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eee5dc] pt-3" aria-label="Workspace navigation preview">
          {navigation.map(([label, tone], index) => (
            <div key={label} className={`${["Home", "Calendar", "Bookings", "Jobs", "Maintenance", "Properties"].includes(label) ? "inline-flex" : "hidden sm:inline-flex"} items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${index === 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-[#dfd2c4] bg-[#fcfaf7] text-[#493b30]"}`}>
              <span className={`h-4 w-1 rounded-full ${navTone[tone]}`} />
              {label}
              {label === "Notifications" ? <span className="rounded-full bg-[#241c15] px-1.5 py-0.5 text-[9px] text-white">3</span> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-[#e5d8c9] bg-white p-4 shadow-[0_16px_40px_rgba(48,35,21,0.06)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a7b68]">Home</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Today at a glance</h1>
            <p className="mt-1 text-sm text-[#7f7263]">Friday, August 21, 2026 · Sample portfolio</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#b48d4e] px-4 py-2 text-xs font-semibold text-black">Help</span>
            <span className="rounded-full bg-[#241c15] px-4 py-2 text-xs font-semibold text-white">Sync all calendars</span>
            <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-xs font-semibold text-[#5f4c3b]">View jobs</span>
            <span className="rounded-full border border-[#cfe1ff] bg-[#f8fbff] px-4 py-2 text-xs font-semibold text-[#2957a4]">Cleaner payouts</span>
          </div>
        </div>

        <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.95fr)]">
          <div className="rounded-[24px] border border-[#cfe1ff] bg-[#f8fbff] p-3 shadow-[0_10px_30px_rgba(59,130,246,0.08)] sm:p-4">
            <div className="rounded-[20px] border border-[#b9d1fb] bg-[#e8f1ff] p-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#4f6ea8]">Happenings</p><h2 className="mt-1 text-lg font-semibold text-[#1f3b63]">Today</h2></div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#2957a4]">5 today</div>
              </div>
              <div className="mt-3 space-y-2">
                {happenings.map((item, index) => {
                  const tone = happeningTone[item.tone];
                  return (
                    <div key={`${item.kind}-${item.title}`} className={`rounded-[18px] border ${tone.border} bg-white px-4 py-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white ${tone.badge}`}>{item.kind}</span>
                          <p className="mt-1.5 text-[15px] font-semibold text-[#1c2b45]">{item.title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[#5f6f86]">{item.detail}</p>
                          <p className="mt-1.5 text-xs font-medium text-[#65574a]">{item.note}</p>
                          {index === 0 ? <div className="mt-2"><div className="h-2 overflow-hidden rounded-full bg-[#eee6dc]"><div className="h-full w-2/3 rounded-full bg-blue-500" /></div><div className="mt-1 text-right text-[10px] font-semibold text-blue-700">Checklist 67%</div></div> : null}
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold ${tone.pill}`}>Today</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 rounded-[20px] border border-[#ecd5a6] bg-[#fff7e8] p-3">
              <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6d5c40]">Upcoming</p><p className="mt-1 text-sm font-semibold text-[#453720]">Next 2 days</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7a5a23]">3 upcoming</span></div>
              <p className="mt-3 text-xs leading-5 text-[#756548]">Two turnovers and one guest arrival are already scheduled and assigned.</p>
            </div>
          </div>

          <div className={`rounded-[24px] border p-3 sm:p-4 ${showVacantProperties ? "border-[#ecd5a6] bg-[#fff8eb] shadow-[0_10px_30px_rgba(180,83,9,0.07)]" : "border-[#bde7cf] bg-[#effcf4] shadow-[0_10px_30px_rgba(22,163,74,0.07)]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${showVacantProperties ? "text-[#8a6428]" : "text-[#15803d]"}`}>{showVacantProperties ? "Vacant" : "Occupied"}</p><h2 className={`mt-1 text-lg font-semibold ${showVacantProperties ? "text-[#453720]" : "text-[#173d28]"}`}>{showVacantProperties ? "Properties vacant today" : "Properties with guests today"}</h2>{showVacantProperties ? <p className="mt-1 text-xs text-[#6d5c40]">Vacant all day or after today&apos;s checkout.</p> : null}</div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`rounded-full bg-white px-3 py-1 text-xs font-semibold ${showVacantProperties ? "text-[#8a6428]" : "text-[#15803d]"}`}>{showVacantProperties ? `${vacant.length} vacant` : `${occupied.length} occupied`}</span>
                <button
                  type="button"
                  onClick={() => setShowVacantProperties((current) => !current)}
                  aria-expanded={showVacantProperties}
                  aria-controls="demo-vacant-properties"
                  className="rounded-full border border-[#d8c7ab] bg-[#fffaf0] px-3 py-1 text-xs font-semibold text-[#7a5a23] transition hover:bg-white"
                >
                  {showVacantProperties ? "Show occupied" : `Show vacant (${vacant.length})`}
                </button>
              </div>
            </div>
            <div className={showVacantProperties ? "hidden" : "mt-3 space-y-2"}>
              {occupied.map((item) => (
                <div key={item.property} className="rounded-[18px] border border-[#bde7cf] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Occupied</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">{item.status}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-[#173d28]">{item.property}</p>
                  <p className="mt-0.5 text-xs text-[#577064]">{item.city}</p>
                  <div className="mt-3 space-y-2 text-xs">
                    {item.checkout ? <div><p className="font-semibold text-amber-700">Checkout today</p><p className="mt-0.5 text-[#5f6f68]">{item.checkout}</p></div> : null}
                    {item.checkin ? <div><p className="font-semibold text-emerald-700">{item.status === "Guest in house" ? "Current stay" : "Check-in today"}</p><p className="mt-0.5 text-[#5f6f68]">{item.checkin}</p></div> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between"><span className="text-[10px] font-bold tracking-[0.14em] text-[#2f6b2f]">{item.source}</span><span className="rounded-full border border-[#bde7cf] bg-[#f4fbf4] px-3 py-1 text-[10px] font-semibold text-[#2f6b2f]">Add note</span></div>
                </div>
              ))}
            </div>
            {showVacantProperties ? (
              <div id="demo-vacant-properties" className="mt-3 space-y-2">
                  {vacant.map((item) => (
                    <div key={item.property} className="rounded-[16px] border border-[#e3cda7] bg-white p-4">
                      <span className="rounded-full bg-[#fef3c7] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#92400e]">{item.status}</span>
                      <p className="mt-2 text-[15px] font-semibold text-[#453720]">{item.property}</p>
                      <p className="mt-0.5 text-xs text-[#7a6a50]">{item.city}</p>
                      <p className="mt-3 text-xs font-semibold text-[#8a4b14]">{item.availability}</p>
                      {item.departingGuest ? <p className="mt-1 text-xs text-[#6d5c40]">{item.departingGuest}</p> : null}
                      <p className="mt-3 text-xs font-semibold text-[#7a5a23]">Next arrival {item.nextArrival}</p>
                      <p className="mt-1 text-xs text-[#6d5c40]">{item.guest}</p>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertiesView() {
  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {properties.map((property, index) => (
          <div key={property.name} className="overflow-hidden rounded-[24px] border border-[#e2d8cc] bg-white shadow-[0_12px_30px_rgba(45,32,20,0.05)]">
            <div className={`h-2 ${index === 0 ? "bg-[#c79a4b]" : index === 1 ? "bg-emerald-500" : index === 2 ? "bg-sky-500" : "bg-rose-500"}`} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold">{property.name}</div><div className="mt-1 text-sm text-[#817466]">{property.city}, Ontario</div></div><ChevronRight size={18} className="text-[#9a8c7e]" /></div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#e2d8cc] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium"><StatusDot tone={property.tone} />{property.status}</div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#eee5db] pt-4 text-center">
                <div><KeyRound size={16} className="mx-auto text-[#9a7438]" /><div className="mt-1 text-[11px] text-[#817466]">Access</div></div>
                <div><FileText size={16} className="mx-auto text-[#9a7438]" /><div className="mt-1 text-[11px] text-[#817466]">SOPs</div></div>
                <div><Users size={16} className="mx-auto text-[#9a7438]" /><div className="mt-1 text-[11px] text-[#817466]">Team</div></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-5">
        <FeatureCard icon={KeyRound} title="Secure property knowledge" body="Keep access notes, Wi-Fi, shutoffs, appliance details, images, and SOPs attached to the right property." />
        <FeatureCard icon={Users} title="The right details for each role" body="Admins, cleaners, grounds staff, and owners each get a focused portal instead of one overloaded dashboard." />
        <FeatureCard icon={MessageCircle} title="Communication in context" body="Chat and bulletin updates stay alongside the properties and work they relate to." />
      </div>
    </div>
  );
}

function OwnersView() {
  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-[24px] border border-[#e2d8cc] bg-white p-5 shadow-[0_12px_30px_rgba(45,32,20,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-lg font-semibold">Owner invoices</div><div className="mt-1 text-sm text-[#817466]">A clear trail from draft to viewed and paid.</div></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">$3,260 paid this month</span></div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-[#e8ded3] text-xs uppercase tracking-[0.1em] text-[#8a7c6e]"><tr><th className="py-3 font-semibold">Invoice</th><th className="py-3 font-semibold">Property</th><th className="py-3 font-semibold">Owner</th><th className="py-3 font-semibold">Amount</th><th className="py-3 font-semibold">Status</th></tr></thead>
            <tbody>
              {[
                ["INV-1044", "Bluewater Lake House", "Jordan Wells", "$920", "Sent"],
                ["INV-1043", "Harbourview Condo", "Mina Patel", "$920", "Viewed"],
                ["INV-1042", "Maple Street Loft", "Chris Morgan", "$1,420", "Paid"],
                ["INV-1041", "Pine Ridge Cabin", "Jordan Wells", "$920", "Paid"],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-[#f0e9e0] last:border-0"><td className="py-4 font-semibold">{row[0]}</td><td className="py-4 text-[#665b50]">{row[1]}</td><td className="py-4 text-[#665b50]">{row[2]}</td><td className="py-4 font-semibold">{row[3]}</td><td className="py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${row[4] === "Paid" ? "bg-emerald-50 text-emerald-800" : row[4] === "Viewed" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>{row[4]}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-5">
        <div className="rounded-[24px] bg-[linear-gradient(145deg,#2d2118,#44321f)] p-5 text-white">
          <ReceiptText size={22} className="text-[#f2d69e]" />
          <div className="mt-5 text-3xl font-semibold">Less explaining. More visibility.</div>
          <p className="mt-3 text-sm leading-6 text-[#dfd2c3]">Owners can see their properties, maintenance updates, upcoming work, and invoice history from their own portal.</p>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-[17px] bg-white/8 p-3"><div className="text-2xl font-semibold">3</div><div className="mt-1 text-xs text-[#d2c2b1]">Active owners</div></div><div className="rounded-[17px] bg-white/8 p-3"><div className="text-2xl font-semibold">100%</div><div className="mt-1 text-xs text-[#d2c2b1]">Invoices viewed</div></div></div>
        </div>
        <FeatureCard icon={FileText} title="Professional documents" body="Generate branded invoices and quotes, attach receipts, and keep a searchable event history." />
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }: { icon: typeof KeyRound; title: string; body: string }) {
  return (
    <div className="rounded-[22px] border border-[#e2d8cc] bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#efe2cc] text-[#79551d]"><Icon size={19} aria-hidden="true" /></div>
      <div className="mt-4 text-base font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[#74685c]">{body}</p>
    </div>
  );
}
