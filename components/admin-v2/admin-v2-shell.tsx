"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./admin-v2-shell.module.css";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type AccessPayload = {
  ok: boolean;
  error?: string;
  profile?: {
    id: string;
    displayName: string;
    role: "admin" | "platform_admin";
  };
  organizations?: Organization[];
};

type ReadyState = {
  kind: "ready";
  displayName: string;
  organizations: Organization[];
  organizationId: string;
};

type ShellState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "choose"; displayName: string; organizations: Organization[] }
  | ReadyState;

const V2_ORGANIZATION_KEY = "gulera-os-v2-organization-id";

function LoadingScene() {
  return (
    <main className={styles.centeredPage}>
      <div className={styles.loadingMark} aria-hidden="true">
        G
      </div>
      <p className={styles.eyebrow}>Gulera OS 2.0</p>
      <h1>Opening your calm command center.</h1>
      <p>Verifying your workspace without loading Classic Gulera.</p>
      <Link className={styles.classicLink} href="/admin">
        Switch to Classic Gulera
      </Link>
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
        <Link className={styles.primaryLink} href="/login?portal=admin">
          Return to login
        </Link>
        <Link className={styles.classicLink} href="/admin">
          Switch to Classic Gulera
        </Link>
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
          <button
            className={styles.organizationChoice}
            key={organization.id}
            onClick={() => onChoose(organization.id)}
            type="button"
          >
            <span>{organization.name}</span>
            <small>{organization.slug || "Authorized workspace"}</small>
          </button>
        ))}
      </div>
      <Link className={styles.classicLink} href="/admin">
        Switch to Classic Gulera
      </Link>
    </main>
  );
}

function CommandCenter({ state, onOrganizationChange }: {
  state: ReadyState;
  onOrganizationChange: (organizationId: string) => void;
}) {
  const organization =
    state.organizations.find((item) => item.id === state.organizationId) ||
    state.organizations[0];

  return (
    <main className={styles.shell}>
      <aside className={styles.rail} aria-label="Gulera OS 2.0 sections">
        <div className={styles.brandMark} aria-label="Gulera OS">
          G
        </div>
        <nav className={styles.railNav}>
          <a className={styles.railItemActive} href="#today" aria-label="Today">
            <span>01</span>
            <strong>Today</strong>
          </a>
          <a className={styles.railItem} href="#readiness" aria-label="Readiness">
            <span>02</span>
            <strong>Ready</strong>
          </a>
          <a className={styles.railItem} href="#approvals" aria-label="Approvals">
            <span>03</span>
            <strong>Approve</strong>
          </a>
        </nav>
        <div className={styles.railFooter}>2.0</div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Gulera OS 2.0</p>
            <p className={styles.workspaceName}>{organization.name}</p>
          </div>
          <div className={styles.topbarActions}>
            {state.organizations.length > 1 ? (
              <label className={styles.organizationSelect}>
                <span>Workspace</span>
                <select
                  aria-label="Choose organization"
                  onChange={(event) => onOrganizationChange(event.target.value)}
                  value={state.organizationId}
                >
                  {state.organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className={styles.statusPill}>Preview · Read-only</div>
            <Link className={styles.classicButton} href="/admin">
              Switch to Classic Gulera
            </Link>
          </div>
        </header>

        <div className={styles.canvas}>
          <section className={styles.hero} id="today">
            <div>
              <p className={styles.eyebrow}>Today&apos;s operating brief</p>
              <h1>Welcome back, {state.displayName}.</h1>
              <p className={styles.heroCopy}>
                Your new operating view starts with clarity: what needs attention,
                what is ready, and what can wait.
              </p>
            </div>
            <div className={styles.heroSignal}>
              <span className={styles.signalDot} aria-hidden="true" />
              <div>
                <strong>Quiet mode</strong>
                <p>No operational actions are enabled in this preview.</p>
              </div>
            </div>
          </section>

          <section className={styles.briefingGrid} aria-label="Daily briefing">
            <article className={styles.primaryBriefing}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>AI Manager</p>
                  <h2>Your first useful operating rhythm</h2>
                </div>
                <span className={styles.cardNumber}>01</span>
              </div>
              <p className={styles.cardLead}>
                Gulera will guide new STR owners from property setup to a calm,
                repeatable turnover—without asking them to learn an operations manual.
              </p>
              <div className={styles.guidanceList}>
                <div>
                  <span>Start here</span>
                  <strong>Build the property foundation</strong>
                  <p>Access, contacts, standards, inventory, and guest-ready details.</p>
                </div>
                <div>
                  <span>Then</span>
                  <strong>Connect the operating team</strong>
                  <p>Give each person only the context and permissions they need.</p>
                </div>
                <div>
                  <span>Next</span>
                  <strong>Rehearse the first turnover</strong>
                  <p>See the timeline before a real guest depends on it.</p>
                </div>
              </div>
            </article>

            <article className={styles.readinessCard} id="readiness">
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Portfolio readiness</p>
                  <h2>Foundation first</h2>
                </div>
                <span className={styles.previewTag}>Shell preview</span>
              </div>
              <div className={styles.readinessDial} aria-label="Readiness begins with setup">
                <div>
                  <strong>0</strong>
                  <span>steps connected</span>
                </div>
              </div>
              <p>
                Live readiness scores arrive in Phase 3 after the read-only data
                contract is reviewed.
              </p>
            </article>
          </section>

          <section className={styles.lowerGrid}>
            <article className={styles.timelineCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Guided journey</p>
                  <h2>From listing to guest-ready</h2>
                </div>
                <span className={styles.cardNumber}>02</span>
              </div>
              <ol className={styles.timeline}>
                <li>
                  <span>Property</span>
                  <p>Capture the essentials once.</p>
                </li>
                <li>
                  <span>Standards</span>
                  <p>Turn expectations into a checklist.</p>
                </li>
                <li>
                  <span>Team</span>
                  <p>Clarify ownership before the work begins.</p>
                </li>
                <li>
                  <span>Turnover</span>
                  <p>Follow one visible operating timeline.</p>
                </li>
              </ol>
            </article>

            <article className={styles.approvalCard} id="approvals">
              <p className={styles.eyebrow}>Human control</p>
              <h2>Nothing moves without you.</h2>
              <p>
                Gulera may eventually explain, rank, draft, and recommend. Messages,
                assignments, charges, and record changes will always wait for explicit
                approval.
              </p>
              <div className={styles.approvalStamp}>
                <span aria-hidden="true">✓</span>
                Approval-first by design
              </div>
            </article>
          </section>

          <footer className={styles.previewFooter}>
            <span>Phase 2 visual shell</span>
            <p>No live operating records are displayed or changed.</p>
          </footer>
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
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as AccessPayload | null;

        if (!response.ok || !payload?.ok || !payload.profile || !payload.organizations?.length) {
          throw new Error(payload?.error || "V2 access could not be verified.");
        }

        if (cancelled) return;

        const savedOrganizationId = window.localStorage.getItem(V2_ORGANIZATION_KEY);
        const savedOrganization = payload.organizations.find(
          (organization) => organization.id === savedOrganizationId
        );

        if (savedOrganization || payload.organizations.length === 1) {
          setState({
            kind: "ready",
            displayName: payload.profile.displayName,
            organizations: payload.organizations,
            organizationId: savedOrganization?.id || payload.organizations[0].id,
          });
          return;
        }

        setState({
          kind: "choose",
          displayName: payload.profile.displayName,
          organizations: payload.organizations,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "V2 access could not be verified.",
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function chooseOrganization(
    displayName: string,
    organizations: Organization[],
    organizationId: string
  ) {
    const authorizedOrganization = organizations.find(
      (organization) => organization.id === organizationId
    );
    if (!authorizedOrganization) return;

    window.localStorage.setItem(V2_ORGANIZATION_KEY, authorizedOrganization.id);
    setState({
      kind: "ready",
      displayName,
      organizations,
      organizationId: authorizedOrganization.id,
    });
  }

  if (state.kind === "loading") return <LoadingScene />;
  if (state.kind === "error") return <AccessError message={state.message} />;
  if (state.kind === "choose") {
    return (
      <OrganizationChooser
        displayName={state.displayName}
        organizations={state.organizations}
        onChoose={(organizationId) =>
          chooseOrganization(state.displayName, state.organizations, organizationId)
        }
      />
    );
  }

  return (
    <CommandCenter
      state={state}
      onOrganizationChange={(organizationId) =>
        chooseOrganization(state.displayName, state.organizations, organizationId)
      }
    />
  );
}
