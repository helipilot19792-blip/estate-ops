import AdminLoadingScene from "@/components/admin/admin-loading-scene";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-6 text-[#241c15] md:px-6">
      <div className="mx-auto max-w-7xl">
        <AdminLoadingScene
          eyebrow="Admin workspace"
          title="Rolling into the dashboard."
          body="Properties, jobs, invoices, and team activity are loading now. The mower is just here to keep morale high while the admin page catches up."
          badge="Starting up"
        />
      </div>
    </main>
  );
}
