"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./demo.module.css";

type DemoStep = {
  id: "briefing" | "property" | "turnover" | "team" | "report";
  number: string;
  label: string;
  title: string;
  explanation: string;
};

const DEMO_STEPS: DemoStep[] = [
  {
    id: "briefing",
    number: "01",
    label: "Daily briefing",
    title: "Know what matters today",
    explanation: "Gulera turns scattered activity into one calm morning brief.",
  },
  {
    id: "property",
    number: "02",
    label: "Property book",
    title: "Capture the home once",
    explanation: "Access, standards, contacts, inventory, and instructions stay attached to the property.",
  },
  {
    id: "turnover",
    number: "03",
    label: "Turnover",
    title: "See checkout become check-in",
    explanation: "Every handoff lives on one shared timeline with clear ownership.",
  },
  {
    id: "team",
    number: "04",
    label: "Team",
    title: "Give people the right context",
    explanation: "Cleaners, grounds, owners, and admins see the information meant for their role.",
  },
  {
    id: "report",
    number: "05",
    label: "Owner report",
    title: "Close the loop with confidence",
    explanation: "Owners receive a clear record of readiness, issues, work, and costs.",
  },
];

function BriefingPreview() {
  return (
    <div className={styles.previewGrid}>
      <article className={styles.briefCardWide}>
        <div className={styles.cardTopline}>
          <span>AI Manager brief</span>
          <span className={styles.livePill}>Demo</span>
        </div>
        <h3>Harbour House is on track for today&apos;s arrival.</h3>
        <p>
          Cleaning is accepted, the guest guide is ready, and one supply check
          needs attention before 3:00 PM.
        </p>
        <div className={styles.actionRow}>
          <div>
            <span>Needs attention</span>
            <strong>Confirm propane level</strong>
          </div>
          <div>
            <span>Next milestone</span>
            <strong>Cleaning starts 11:30 AM</strong>
          </div>
        </div>
      </article>
      <article className={styles.scoreCard}>
        <span>Guest readiness</span>
        <strong>82%</strong>
        <div className={styles.progressTrack}><i style={{ width: "82%" }} /></div>
        <p>7 of 8 essentials are ready</p>
      </article>
      <article className={styles.metricCard}>
        <span>Today</span>
        <strong>1 arrival</strong>
        <p>No scheduling conflicts</p>
      </article>
      <article className={styles.metricCard}>
        <span>Open issues</span>
        <strong>1 low priority</strong>
        <p>Propane check · assigned</p>
      </article>
    </div>
  );
}

function PropertyPreview() {
  return (
    <div className={styles.propertyLayout}>
      <article className={styles.propertyHero}>
        <div className={styles.houseScene} aria-label="Illustration of fictional Harbour House">
          <div className={styles.sun} />
          <div className={styles.houseRoof} />
          <div className={styles.houseBody}><i /><i /><i /></div>
          <div className={styles.waterline} />
        </div>
        <div>
          <span className={styles.kicker}>Fictional demo property</span>
          <h3>Harbour House</h3>
          <p>Picton, Ontario · 3 bedrooms · 2 bathrooms · Sleeps 6</p>
        </div>
      </article>
      <div className={styles.propertyDetails}>
        {[
          ["Access", "Smart lock and backup key recorded", "Ready"],
          ["Guest guide", "Wi-Fi, parking, checkout, local tips", "Ready"],
          ["Turnover standard", "38-point cleaning checklist", "Ready"],
          ["Inventory", "Propane level needs confirmation", "Review"],
        ].map(([label, body, status]) => (
          <article key={label}>
            <div><span>{label}</span><strong>{body}</strong></div>
            <em className={status === "Ready" ? styles.ready : styles.review}>{status}</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function TurnoverPreview() {
  const events = [
    ["11:00", "Guest checkout", "Complete", "Guests checked out on time"],
    ["11:30", "Cleaning begins", "Accepted", "Alex Morgan · 38-point checklist"],
    ["2:45", "Quality review", "Planned", "Photos and final walkthrough"],
    ["4:00", "Next arrival", "Protected", "Door code activates at check-in"],
  ];

  return (
    <div className={styles.turnoverLayout}>
      <div className={styles.timelineHeader}>
        <div><span>Today · Harbour House</span><h3>One visible operating timeline</h3></div>
        <div className={styles.turnoverWindow}>5-hour turnover window</div>
      </div>
      <ol className={styles.demoTimeline}>
        {events.map(([time, title, status, body], index) => (
          <li key={time}>
            <time>{time}</time>
            <i className={index < 2 ? styles.timelineDone : styles.timelineFuture} />
            <div><span>{status}</span><strong>{title}</strong><p>{body}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TeamPreview() {
  const people = [
    ["AM", "Alex Morgan", "Cleaner", "Accepted today's turnover"],
    ["JR", "Jamie Reed", "Grounds", "Seasonal exterior check Friday"],
    ["MS", "Morgan Shaw", "Owner", "Receives reports and invoices"],
  ];

  return (
    <div className={styles.teamLayout}>
      <article className={styles.roleExplainer}>
        <span className={styles.kicker}>Role-based by design</span>
        <h3>Everyone sees what they need. Nothing more.</h3>
        <p>
          The admin coordinates the operation. Staff receive assigned work and
          property instructions. The owner receives a clear, separate view.
        </p>
      </article>
      <div className={styles.peopleList}>
        {people.map(([initials, name, role, status]) => (
          <article key={role}>
            <div className={styles.avatar}>{initials}</div>
            <div><strong>{name}</strong><span>{role}</span><p>{status}</p></div>
            <em>Correct access</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function ReportPreview() {
  return (
    <div className={styles.reportLayout}>
      <article className={styles.reportSheet}>
        <div className={styles.reportHeader}>
          <div><span>Owner summary</span><h3>Harbour House · August</h3></div>
          <div className={styles.logoMini}>G</div>
        </div>
        <div className={styles.reportStats}>
          <div><span>Turnovers</span><strong>6</strong></div>
          <div><span>Completed on time</span><strong>100%</strong></div>
          <div><span>Open maintenance</span><strong>1</strong></div>
        </div>
        <div className={styles.reportNote}>
          <span>Operator note</span>
          <p>All August arrivals were guest-ready. Propane monitoring was added after the mid-month inspection.</p>
        </div>
      </article>
      <article className={styles.approvalDemo}>
        <span className={styles.kicker}>Human approval</span>
        <h3>Gulera prepares. You decide.</h3>
        <p>This demo never sends messages, assigns work, creates charges, or changes a real record.</p>
        <div><span>✓</span> Approval required before action</div>
      </article>
    </div>
  );
}

function StepPreview({ step }: { step: DemoStep["id"] }) {
  if (step === "property") return <PropertyPreview />;
  if (step === "turnover") return <TurnoverPreview />;
  if (step === "team") return <TeamPreview />;
  if (step === "report") return <ReportPreview />;
  return <BriefingPreview />;
}

export default function DemoPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = DEMO_STEPS[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / DEMO_STEPS.length) * 100, [stepIndex]);

  return (
    <main className={styles.demoPage}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>G</span><div><strong>Gulera OS</strong><small>Guided demo</small></div></Link>
        <div className={styles.headerActions}>
          <span className={styles.demoBadge}>Fictional data · No login</span>
          <Link href="/login" className={styles.exitLink}>Exit demo</Link>
        </div>
      </header>

      <div className={styles.demoShell}>
        <aside className={styles.tourRail}>
          <div>
            <span className={styles.kicker}>Demo account</span>
            <h1>See one stay run from end to end.</h1>
            <p>Explore the operating rhythm a new STR owner gets with Gulera OS.</p>
          </div>
          <nav aria-label="Demo walkthrough">
            {DEMO_STEPS.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === stepIndex ? styles.stepActive : styles.stepButton}
                onClick={() => setStepIndex(index)}
              >
                <span>{item.number}</span>
                <div><strong>{item.label}</strong><small>{item.title}</small></div>
              </button>
            ))}
          </nav>
          <div className={styles.railFooter}>
            <div className={styles.tourProgress}><i style={{ width: `${progress}%` }} /></div>
            <span>{stepIndex + 1} of {DEMO_STEPS.length}</span>
          </div>
        </aside>

        <section className={styles.stage}>
          <div className={styles.stageIntro}>
            <div>
              <span className={styles.kicker}>{step.number} · {step.label}</span>
              <h2>{step.title}</h2>
              <p>{step.explanation}</p>
            </div>
            <div className={styles.propertyChip}><i>HH</i><div><strong>Harbour House</strong><span>Demo Owner account</span></div></div>
          </div>

          <div className={styles.productFrame}>
            <div className={styles.frameBar}>
              <div><i /><i /><i /></div>
              <span>Harbour House · Demo workspace</span>
              <em>Read-only</em>
            </div>
            <div className={styles.frameBody}><StepPreview step={step.id} /></div>
          </div>

          <div className={styles.stageControls}>
            <button type="button" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}>← Previous</button>
            {stepIndex < DEMO_STEPS.length - 1 ? (
              <button className={styles.nextButton} type="button" onClick={() => setStepIndex((index) => Math.min(DEMO_STEPS.length - 1, index + 1))}>Next: {DEMO_STEPS[stepIndex + 1].label} →</button>
            ) : (
              <Link className={styles.nextButton} href="/login">Start your own workspace →</Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
