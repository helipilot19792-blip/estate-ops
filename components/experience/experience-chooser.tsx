"use client";

import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rememberGuleraExperience, type GuleraExperience } from "@/lib/gulera-experience";
import { supabase } from "@/lib/supabase";
import styles from "./experience-chooser.module.css";

type ChooserState =
  | { kind: "loading" }
  | { kind: "ready"; displayName: string }
  | { kind: "error"; message: string };

type AccessPayload = {
  ok?: boolean;
  error?: string;
  profile?: { displayName?: string };
};

export default function ExperienceChooser() {
  const router = useRouter();
  const [state, setState] = useState<ChooserState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

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

        if (!response.ok || !payload?.ok) {
          if (response.status === 401) {
            router.replace("/login?portal=admin");
            return;
          }
          if (response.status === 403 || response.status === 404) {
            router.replace("/admin");
            return;
          }
          throw new Error(payload?.error || "The preview could not be verified.");
        }

        if (!cancelled) {
          setState({
            kind: "ready",
            displayName: payload.profile?.displayName?.trim() || "there",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "The preview could not be verified.",
          });
        }
      }
    }

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function choose(experience: GuleraExperience) {
    rememberGuleraExperience(experience);
    router.push(experience === "v2" ? "/admin-v2" : "/admin");
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingMark} aria-hidden="true">G</div>
        <p className={styles.eyebrow}>Gulera OS</p>
        <h1>Preparing your experiences.</h1>
        <p>Verifying your existing admin access without changing your workspace.</p>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.statusPill}>Preview unavailable</div>
        <h1>Classic Gulera is still ready.</h1>
        <p>{state.message}</p>
        <button className={styles.classicFallback} onClick={() => choose("classic")} type="button">
          Open Classic Gulera
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">G</span>
          <span>
            <strong>Gulera OS</strong>
            <small>Property operations, your way</small>
          </span>
        </div>
        <div className={styles.securityNote}>
          <ShieldCheck size={16} aria-hidden="true" />
          Existing login and permissions
        </div>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>Welcome, {state.displayName}</p>
        <h1>Choose your Gulera experience.</h1>
        <p>
          Both experiences use the same protected operating records. Your choice changes the
          interface you open—not your data, role, company, or permissions.
        </p>
      </section>

      <section className={styles.choices} aria-label="Gulera experiences">
        <article className={`${styles.choice} ${styles.classicChoice}`}>
          <div className={styles.choiceTopline}>
            <span className={styles.choiceNumber}>01</span>
            <span className={styles.stablePill}>Current workspace</span>
          </div>
          <div>
            <p className={styles.choiceEyebrow}>Full operations</p>
            <h2>Classic Gulera</h2>
            <p className={styles.choiceDescription}>
              The complete workspace you use today for properties, staffing, chat, maintenance,
              invoices, and operational changes.
            </p>
          </div>
          <ul className={styles.featureList}>
            <li><Check size={16} aria-hidden="true" /> All current workflows</li>
            <li><Check size={16} aria-hidden="true" /> Editing and team actions</li>
            <li><Check size={16} aria-hidden="true" /> Familiar navigation</li>
          </ul>
          <button className={styles.classicAction} onClick={() => choose("classic")} type="button">
            Continue with Classic <ArrowRight size={18} aria-hidden="true" />
          </button>
        </article>

        <article className={`${styles.choice} ${styles.v2Choice}`}>
          <div className={styles.choiceTopline}>
            <span className={styles.choiceNumber}>02</span>
            <span className={styles.previewPill}><Sparkles size={13} aria-hidden="true" /> Preview</span>
          </div>
          <div>
            <p className={styles.choiceEyebrow}>Calm command center</p>
            <h2>Gulera OS 2.0</h2>
            <p className={styles.choiceDescription}>
              A guided, visual operating brief that ranks today’s priorities and turns live
              records into a clear portfolio timeline.
            </p>
          </div>
          <ul className={styles.featureList}>
            <li><Check size={16} aria-hidden="true" /> AI Manager daily briefing</li>
            <li><Check size={16} aria-hidden="true" /> Timeline and readiness views</li>
            <li><ShieldCheck size={16} aria-hidden="true" /> Read-only—no actions performed</li>
          </ul>
          <button className={styles.v2Action} onClick={() => choose("v2")} type="button">
            Enter the 2.0 preview <ArrowRight size={18} aria-hidden="true" />
          </button>
        </article>
      </section>

      <footer className={styles.footer}>
        <span>Your choice is saved only in this browser.</span>
        <span>You can switch back at any time.</span>
      </footer>
    </main>
  );
}
