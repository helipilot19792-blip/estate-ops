"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import type {
  AdminV2AttentionItem,
  AdminV2Briefing,
  AdminV2TimelineItem,
} from "@/lib/admin-v2/briefing";
import { supabase } from "@/lib/supabase";
import styles from "./admin-v2-shell.module.css";

type Organization = { id: string; name: string; slug: string };
type AccessPayload = {
  ok: boolean;
  error?: string;
  profile?: { id: string; displayName: string; role: "admin" | "platform_admin" };
  organizations?: Organization[];
};
type BriefingPayload = { ok: boolean; error?: string; briefing?: AdminV2Briefing };
type BriefingState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AdminV2Briefing };
type ReadyState = {
  kind: "ready";
  displayName: string;
  organizations: Organization[];
  organizationId: string;
  briefing: BriefingState;
};
type ShellState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "choose"; displayName: string; organizations: Organization[] }
  | ReadyState;

const V2_ORGANIZATION_KEY = "gulera-os-v2-organization-id";

async function requestBriefing(token: string, organizationId: string) {
  const response = await fetch(`/api/admin-v2/briefing?organizationId=${encodeURIComponent(organizationId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as BriefingPayload | null;
  if (!response.ok || !payload?.ok || !payload.briefing) {
    throw new Error(payload?.error || "The live briefing could not be prepared.");
  }
  return payload.briefing;
}

function LoadingScene() {
  return (
    <main className={styles.centeredPage}>
      <div className={styles.loadingMark} aria-hidden="true">G</div>
      <p className={styles.eyebrow}>Gulera OS 2.0</p>
      <h1>Opening your calm command center.</h1>
      <p>Verifying your workspace without loading Classic Gulera.</p>
      <Link className={styles.classicLink} href="/admin">Switch to Classic Gulera</Link>
    </main>
  );
}

function AccessError({ message }: { message: string }) {
  return (
    <main className={styles.centeredPage}>
      <div className={styles.statusPill}>Preview unavailable</div>
      <h1>We kept your workspace closed.</h1>
      <p>{message}</p>
      <div className={styles.centeredActions}>
        <Link className={styles.primaryLink} href="/login?portal=admin">Return to login</Link>
        <Link className={styles.classicLink} href="/admin">Switch to Classic Gulera</Link>
      </div>
    </main>
  );
}

function OrganizationChooser({
  displayName,
  organizations,
  onChoose,
}: {
  displayName: string;
  organizations: Organization[];
  onChoose: (organizationId: string) => void;
}) {
  return (
    <main className={styles.centeredPage}>
      <div className={styles.statusPill}>Preview · Read-only</div>
      <p className={styles.eyebrow}>Welcome, {displayName}</p>
      <h1>Which workspace should we open?</h1>
      <p>Gulera will not assume when more than one organization is available.</p>
      <div className={styles.organizationChoices}>
        {organizations.map((organization) => (
          <button className={styles.organizationChoice} key={organization.id} onClick={() => onChoose(organization.id)} type="button">
            <span>{organization.name}</span>
            <small>{organization.slug || "Authorized workspace"}</small>
          </button>
        ))}
      </div>
      <Link className={styles.classicLink} href="/admin">Switch to Classic Gulera</Link>
    </main>
  );
}

function formatDate(value: string, today: string) {
  if (value === today) return "Today";
  const tomorrow = new Date(`${today}T12:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (value === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function severityLabel(item: AdminV2AttentionItem) {
  if (item.severity === "urgent") return "Needs review";
  if (item.severity === "attention") return "Watch";
  return "Guided setup";
}

function timelineLabel(item: AdminV2TimelineItem) {
  if (item.kind === "arrival") return "Arrival";
  if (item.kind === "checkout") return "Checkout";
  return item.status === "ready" ? "Turnover covered" : "Turnover watch";
}

function BriefingLoading() {
  return (
    <div className={styles.liveLoading} aria-live="polite">
      <div className={styles.loadingPulse} />
      <p className={styles.eyebrow}>Reading current records</p>
      <h2>Preparing your operating brief.</h2>
      <p>Bookings, turnovers, maintenance, inspections, and setup signals are being summarized.</p>
    </div>
  );
}

function BriefingErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.liveError} role="alert">
      <p className={styles.eyebrow}>Live brief unavailable</p>
      <h2>Your records stayed protected.</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>Try the read-only brief again</button>
    </div>
  );
}

function LiveBriefing({ data }: { data: AdminV2Briefing }) {
  const urgentCount = data.attention.filter((item) => item.severity === "urgent").length;

  return (
    <>
      <section className={styles.hero} id="today">
        <div>
          <p className={styles.eyebrow}>Today&apos;s AI Manager brief</p>
          <h1>{data.summary.headline}</h1>
          <p className={styles.heroCopy}>{data.summary.detail}</p>
        </div>
        <div className={`${styles.heroSignal} ${styles[`signal_${data.summary.tone}`]}`}>
          <span className={styles.signalDot} aria-hidden="true" />
          <div>
            <strong>{data.summary.tone === "calm" ? "Calm operation" : `${urgentCount} urgent signal${urgentCount === 1 ? "" : "s"}`}</strong>
            <p>Generated from live records at {new Date(data.generatedAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })}.</p>
          </div>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Today at a glance">
        <article><span>Portfolio</span><strong>{data.metrics.propertyCount}</strong><p>active propert{data.metrics.propertyCount === 1 ? "y" : "ies"}</p></article>
        <article><span>Readiness</span><strong>{data.metrics.portfolioReadiness}%</strong><p>foundation complete</p></article>
        <article><span>Today</span><strong>{data.metrics.arrivalsToday} / {data.metrics.departuresToday}</strong><p>arrivals / departures</p></article>
        <article><span>Turnovers</span><strong>{data.metrics.coveredTurnoversToday} / {data.metrics.turnoversToday}</strong><p>covered today</p></article>
        <article><span>Open care</span><strong>{data.metrics.openMaintenance}</strong><p>maintenance records</p></article>
      </section>

      <section className={styles.briefingGrid}>
        <article className={styles.primaryBriefing}>
          <div className={styles.cardHeader}>
            <div><p className={styles.eyebrow}>Ranked attention</p><h2>What deserves a human decision</h2></div>
            <span className={styles.cardNumber}>{String(data.attention.length).padStart(2, "0")}</span>
          </div>
          {data.attention.length ? (
            <div className={styles.attentionList}>
              {data.attention.map((item) => (
                <div className={styles.attentionItem} key={item.id}>
                  <span className={`${styles.severity} ${styles[`severity_${item.severity}`]}`}>{severityLabel(item)}</span>
                  <div>
                    <div className={styles.attentionTitleRow}>
                      <strong>{item.title}</strong>
                      {item.date ? <time>{formatDate(item.date, data.window.start)}</time> : null}
                    </div>
                    <p>{item.detail}</p>
                    <small>{item.recommendation}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className={styles.emptyState}><strong>No urgent operating signals.</strong><p>Gulera will keep monitoring the read-only view as records change.</p></div>}
        </article>

        <article className={styles.readinessCard}>
          <div className={styles.cardHeader}>
            <div><p className={styles.eyebrow}>Portfolio readiness</p><h2>Foundation health</h2></div>
            <span className={styles.previewTag}>Live</span>
          </div>
          <div
            className={styles.readinessDial}
            style={{ "--readiness-angle": `${data.metrics.portfolioReadiness * 3.6}deg` } as CSSProperties}
            aria-label={`${data.metrics.portfolioReadiness}% portfolio readiness`}
          >
            <div><strong>{data.metrics.portfolioReadiness}%</strong><span>portfolio ready</span></div>
          </div>
          <p>{data.metrics.teamMembers} team member{data.metrics.teamMembers === 1 ? "" : "s"} connected · {data.metrics.overdueInspections} overdue inspection{data.metrics.overdueInspections === 1 ? "" : "s"}.</p>
        </article>
      </section>

      <section className={styles.timelineCard} id="timeline">
        <div className={styles.cardHeader}>
          <div><p className={styles.eyebrow}>14-day operating timeline</p><h2>Checkout to check-in, in one view</h2></div>
          <span className={styles.cardNumber}>02</span>
        </div>
        {data.timeline.length ? (
          <ol className={styles.liveTimeline}>
            {data.timeline.map((item) => (
              <li key={item.id}>
                <time>{formatDate(item.date, data.window.start)}</time>
                <span className={`${styles.timelineMarker} ${styles[`timeline_${item.status}`]}`} aria-hidden="true" />
                <div><small>{timelineLabel(item)}</small><strong>{item.propertyName}</strong><p>{item.detail}</p></div>
              </li>
            ))}
          </ol>
        ) : <div className={styles.emptyState}><strong>No arrivals, departures, or turnovers in this window.</strong><p>The timeline will populate from connected booking and turnover records.</p></div>}
      </section>

      <section className={styles.portfolioSection} id="portfolio">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Visual portfolio</p><h2>Every property, ordered by readiness</h2></div>
          <span>{data.properties.length} properties</span>
        </div>
        {data.properties.length ? (
          <div className={styles.propertyGrid}>
            {data.properties.map((property) => (
              <article className={styles.propertyCard} key={property.id}>
                <div className={styles.propertyCardTop}>
                  <div><span className={styles.propertyInitial}>{property.name.slice(0, 1).toUpperCase()}</span><div><strong>{property.name}</strong><small>{property.address}</small></div></div>
                  <em>{property.readinessScore}%</em>
                </div>
                <div className={styles.propertyProgress}><i style={{ width: `${property.readinessScore}%` }} /></div>
                <div className={styles.propertyFacts}>
                  <div><span>Next arrival</span><strong>{property.nextArrivalDate ? formatDate(property.nextArrivalDate, data.window.start) : "None scheduled"}</strong></div>
                  <div><span>Open issues</span><strong>{property.openIssueCount}</strong></div>
                  <div><span>Turnover</span><strong>{property.nextTurnoverStatus || "No upcoming job"}</strong></div>
                </div>
                {property.missingSignals.length ? <p>Next foundation step: {property.missingSignals[0]}</p> : <p>Core operating foundation is connected.</p>}
              </article>
            ))}
          </div>
        ) : <div className={styles.emptyState}><strong>No properties are available in this organization.</strong><p>Add the first property in Classic Gulera before using portfolio readiness.</p></div>}
      </section>

      <section className={styles.approvalCard} id="control">
        <p className={styles.eyebrow}>Human control</p>
        <h2>Analysis is live. Actions are not.</h2>
        <p>Gulera can read, explain, rank, and recommend in this phase. Messages, assignments, charges, permissions, and record changes remain unavailable.</p>
        <div className={styles.approvalStamp}><span aria-hidden="true">✓</span> Read-only contract verified</div>
      </section>

      <footer className={styles.previewFooter}>
        <span>Phase 3 · Read-only AI Manager</span>
        <p>Live organization records · No external or state-changing actions</p>
      </footer>
    </>
  );
}

function CommandCenter({ state, onOrganizationChange, onRetry }: {
  state: ReadyState;
  onOrganizationChange: (organizationId: string) => void;
  onRetry: () => void;
}) {
  const organization = state.organizations.find((item) => item.id === state.organizationId) || state.organizations[0];
  return (
    <main className={styles.shell}>
      <aside className={styles.rail} aria-label="Gulera OS 2.0 sections">
        <div className={styles.brandMark} aria-label="Gulera OS">G</div>
        <nav className={styles.railNav}>
          <a className={styles.railItemActive} href="#today"><span>01</span><strong>Today</strong></a>
          <a className={styles.railItem} href="#timeline"><span>02</span><strong>Timeline</strong></a>
          <a className={styles.railItem} href="#portfolio"><span>03</span><strong>Portfolio</strong></a>
          <a className={styles.railItem} href="#control"><span>04</span><strong>Control</strong></a>
        </nav>
        <div className={styles.railFooter}>2.0</div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p className={styles.eyebrow}>Gulera OS 2.0</p><p className={styles.workspaceName}>{organization.name}</p></div>
          <div className={styles.topbarActions}>
            {state.organizations.length > 1 ? (
              <label className={styles.organizationSelect}>
                <span>Workspace</span>
                <select aria-label="Choose organization" onChange={(event) => onOrganizationChange(event.target.value)} value={state.organizationId}>
                  {state.organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            <div className={styles.statusPill}>Live records · Read-only</div>
            <Link className={styles.classicButton} href="/admin">Switch to Classic Gulera</Link>
          </div>
        </header>

        <div className={styles.canvas}>
          {state.briefing.kind === "loading" ? <BriefingLoading /> : null}
          {state.briefing.kind === "error" ? <BriefingErrorPanel message={state.briefing.message} onRetry={onRetry} /> : null}
          {state.briefing.kind === "ready" ? <LiveBriefing data={state.briefing.data} /> : null}
        </div>
      </section>
    </main>
  );
}

export default function AdminV2Shell() {
  const router = useRouter();
  const [state, setState] = useState<ShellState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login?portal=admin");
        return;
      }

      try {
        const response = await fetch("/api/admin-v2/access", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as AccessPayload | null;
        if (!response.ok || !payload?.ok || !payload.profile || !payload.organizations?.length) {
          throw new Error(payload?.error || "V2 access could not be verified.");
        }
        if (cancelled) return;

        const savedOrganizationId = window.localStorage.getItem(V2_ORGANIZATION_KEY);
        const savedOrganization = payload.organizations.find((item) => item.id === savedOrganizationId);
        if (!savedOrganization && payload.organizations.length > 1) {
          setState({ kind: "choose", displayName: payload.profile.displayName, organizations: payload.organizations });
          return;
        }

        const organizationId = savedOrganization?.id || payload.organizations[0].id;
        const readyBase = { kind: "ready" as const, displayName: payload.profile.displayName, organizations: payload.organizations, organizationId };
        setState({ ...readyBase, briefing: { kind: "loading" } });
        try {
          const briefing = await requestBriefing(session.access_token, organizationId);
          if (!cancelled) setState({ ...readyBase, briefing: { kind: "ready", data: briefing } });
        } catch (error) {
          if (!cancelled) setState({ ...readyBase, briefing: { kind: "error", message: error instanceof Error ? error.message : "The live briefing could not be prepared." } });
        }
      } catch (error) {
        if (!cancelled) setState({ kind: "error", message: error instanceof Error ? error.message : "V2 access could not be verified." });
      }
    });
    return () => { cancelled = true; };
  }, [router]);

  async function chooseOrganization(displayName: string, organizations: Organization[], organizationId: string) {
    const authorizedOrganization = organizations.find((item) => item.id === organizationId);
    if (!authorizedOrganization) return;
    window.localStorage.setItem(V2_ORGANIZATION_KEY, authorizedOrganization.id);
    const readyBase = { kind: "ready" as const, displayName, organizations, organizationId: authorizedOrganization.id };
    setState({ ...readyBase, briefing: { kind: "loading" } });

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login?portal=admin");
      return;
    }
    try {
      const briefing = await requestBriefing(data.session.access_token, authorizedOrganization.id);
      setState({ ...readyBase, briefing: { kind: "ready", data: briefing } });
    } catch (error) {
      setState({ ...readyBase, briefing: { kind: "error", message: error instanceof Error ? error.message : "The live briefing could not be prepared." } });
    }
  }

  if (state.kind === "loading") return <LoadingScene />;
  if (state.kind === "error") return <AccessError message={state.message} />;
  if (state.kind === "choose") {
    return <OrganizationChooser displayName={state.displayName} organizations={state.organizations} onChoose={(organizationId) => void chooseOrganization(state.displayName, state.organizations, organizationId)} />;
  }

  return (
    <CommandCenter
      state={state}
      onOrganizationChange={(organizationId) => void chooseOrganization(state.displayName, state.organizations, organizationId)}
      onRetry={() => void chooseOrganization(state.displayName, state.organizations, state.organizationId)}
    />
  );
}
