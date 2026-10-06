"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CleanerDashboardPayload } from "@/components/cleaner/cleanershell";
import type { OwnerPreviewDashboard } from "@/components/owner/ownerportal";

const CleanerShell = dynamic(() => import("@/components/cleaner/cleanershell"));
const OwnerPortal = dynamic(() => import("@/components/owner/ownerportal"));
type Preview = { portal: "cleaner"; name: string; dashboard: CleanerDashboardPayload } | { portal: "owner"; name: string; dashboard: OwnerPreviewDashboard };

export default function PortalPreviewPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams(window.location.search);
        const organizationId = params.get("organizationId") || "";
        setOrganizationId(organizationId);
        setMode(window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in as an organization admin to open this preview.");
        const response = await fetch("/api/admin/portal-preview", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ organizationId, portal: params.get("portal"), accountId: params.get("accountId") }), signal: controller.signal, cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not open portal preview.");
        if (!controller.signal.aborted) setPreview(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not open portal preview.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return (
    <div className="min-h-screen bg-[#100d0a]">
      <div className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-5 py-4 text-[#241c15] shadow-sm">
        <div>
          <strong>{preview ? `Viewing as ${preview.name} — ${preview.portal}` : "Portal preview"}</strong>
          <p className="text-sm">Read-only · Selected organization only · Chat, notifications, and changes are disabled.</p>
        </div>
        <div className="flex items-center gap-3">
          {preview?.portal === "cleaner" ? <label className="text-sm">Layout <select value={mode} onChange={event => setMode(event.target.value as "desktop" | "mobile")} className="rounded-lg border border-amber-400 bg-white px-2 py-2"><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label> : null}
          <a href={`/admin?organizationId=${encodeURIComponent(organizationId)}`} className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-white">Exit preview</a>
        </div>
      </div>
      {error ? <p role="alert" className="m-6 rounded-xl bg-white p-5 text-red-700">{error}</p>
        : !preview ? <p className="p-8 text-white" role="status">Loading portal preview…</p>
          : preview.portal === "cleaner" ? <CleanerShell mode={mode} preview={preview.dashboard} />
            : <OwnerPortal preview={preview.dashboard} />}
    </div>
  );
}
