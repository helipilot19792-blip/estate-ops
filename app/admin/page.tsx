"use client";

import dynamic from "next/dynamic";
import AdminLoadingScene from "@/components/admin/admin-loading-scene";

function AdminWorkspaceFallback() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-6 text-[#241c15] md:px-6">
      <div className="mx-auto max-w-7xl">
        <AdminLoadingScene
          eyebrow="Admin workspace"
          title="Preparing the dashboard."
          body="The home screen is opening while the rest of the workspace loads quietly."
          badge="Loading"
        />
      </div>
    </main>
  );
}

const AdminWorkspace = dynamic(() => import("@/components/admin/admin-workspace"), {
  loading: AdminWorkspaceFallback,
  // The authenticated workspace cannot render useful content on the server: it
  // starts in an auth/loading state and then fetches the selected organization in
  // the browser. Avoid loading and evaluating the 1MB+ workspace module in the
  // server render path as well as in the browser.
  ssr: false,
});

export default function AdminPage() {
  return <AdminWorkspace />;
}
