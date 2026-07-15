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
  ssr: false,
  loading: AdminWorkspaceFallback,
});

export default function AdminPage() {
  return <AdminWorkspace />;
}
