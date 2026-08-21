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
          <div className="border-b border-white/10 p-5">
            <div className="rounded-[17px] bg-white px-3 py-3">
              <Image src="/guleraoslogo.png" alt="Gulera OS" width={260} height={110} className="h-auto w-[155px]" priority />
            </div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8b79f]">Demo workspace</div>
            <div className="mt-1 text-base font-semibold">North Shore Stays</div>
            <div className="mt-1 text-xs text-[#c8b79f]">4-property portfolio</div>
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

        <section className="rounded-b-[28px] bg-[#f8f5f0] p-4 sm:p-6 lg:rounded-bl-none lg:rounded-r-[28px] lg:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7438]">Small portfolio command centre</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                {view === "today" ? "Good morning, Alex." : view === "properties" ? "Every property, properly organized." : "Owner reporting without the spreadsheet chase."}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#74685c] sm:text-base">
                {view === "today"
                  ? "Here is what needs attention across bookings, staff, maintenance, and billing today."
                  : view === "properties"
                    ? "Keep the details your team needs—from access codes and SOPs to schedules and maintenance—in one reliable place."
                    : "Create invoices, track what owners have viewed, and keep each property’s financial history close to its operations."}
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 size={16} aria-hidden="true" /> 3 of 4 properties on track
            </div>
          </div>

          {view === "today" ? <TodayView /> : null}
          {view === "properties" ? <PropertiesView /> : null}
          {view === "owners" ? <OwnersView /> : null}

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
  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Properties", value: "4", note: "All calendars synced", icon: Building2 },
            { label: "Upcoming stays", value: "7", note: "Next 14 days", icon: CalendarDays },
            { label: "Open work", value: "3", note: "2 cleaning · 1 grounds", icon: ClipboardCheck },
            { label: "Owner invoices", value: "$1,840", note: "2 awaiting payment", icon: ReceiptText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[22px] border border-[#e2d8cc] bg-white p-4 shadow-[0_12px_30px_rgba(45,32,20,0.05)]">
                <div className="flex items-center justify-between text-[#8a6a35]"><span className="text-xs font-semibold uppercase tracking-[0.12em]">{item.label}</span><Icon size={17} /></div>
                <div className="mt-4 text-2xl font-semibold tracking-tight">{item.value}</div>
                <div className="mt-1 text-xs text-[#817466]">{item.note}</div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-[#e2d8cc] bg-white p-5 shadow-[0_12px_30px_rgba(45,32,20,0.05)]">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-lg font-semibold">Next up</div><div className="mt-1 text-sm text-[#817466]">Upcoming stays automatically become work your team can accept and complete.</div></div>
            <CalendarDays size={22} className="text-[#a9782e]" />
          </div>
          <div className="mt-5 space-y-3">
            {[
              { date: "22 AUG", property: "Bluewater Lake House", detail: "Turnover · 11:00 AM", person: "Maria + Devon", status: "Fully staffed", tone: "green" },
              { date: "24 AUG", property: "Harbourview Condo", detail: "Guest arrival · 4:00 PM", person: "Access ready", status: "Ready", tone: "blue" },
              { date: "26 AUG", property: "Maple Street Loft", detail: "Turnover · 10:30 AM", person: "1 cleaner needed", status: "Offer sent", tone: "amber" },
            ].map((item) => (
              <div key={`${item.date}-${item.property}`} className="grid gap-3 rounded-[18px] border border-[#ece4db] bg-[#fcfaf7] p-3 sm:grid-cols-[64px_1fr_auto] sm:items-center">
                <div className="rounded-[13px] bg-[#241c15] px-2 py-2 text-center text-[11px] font-semibold leading-4 text-[#f5dfb2]">{item.date}</div>
                <div><div className="text-sm font-semibold">{item.property}</div><div className="mt-1 text-xs text-[#817466]">{item.detail} · {item.person}</div></div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ddd0c2] bg-white px-3 py-1.5 text-xs font-medium"><StatusDot tone={item.tone} />{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-[24px] border border-amber-200 bg-[#fff9eb] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={18} /> Needs attention</div>
          <div className="mt-4 rounded-[17px] border border-amber-200 bg-white p-4">
            <div className="text-sm font-semibold">Pine Ridge Cabin</div>
            <div className="mt-1 text-sm leading-6 text-[#74685c]">Guest reported a slow kitchen drain. Owner has not been notified yet.</div>
            <div className="mt-3 flex items-center justify-between text-xs"><span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">Normal urgency</span><span className="text-[#817466]">12 min ago</span></div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#e2d8cc] bg-white p-5">
          <div className="text-lg font-semibold">Team pulse</div>
          <div className="mt-4 space-y-4">
            {[
              ["MC", "Maria Chen", "Accepted Lake House turnover"],
              ["DP", "Devon Price", "Completed grounds checklist"],
              ["AL", "Alex Lee", "Sent owner invoice INV-1042"],
            ].map(([initials, name, action]) => (
              <div key={name} className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eee2cf] text-xs font-semibold text-[#744f18]">{initials}</div><div><div className="text-sm font-semibold">{name}</div><div className="mt-0.5 text-xs leading-5 text-[#817466]">{action}</div></div></div>
            ))}
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
