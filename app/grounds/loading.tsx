import PortalLoadingScene from "@/components/portal/portal-loading-scene";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#102018] px-4 py-6 text-[#241c15] md:px-6">
      <div className="mx-auto max-w-7xl">
        <PortalLoadingScene
          eyebrow="Grounds portal"
          title="Preparing the grounds board."
          body="Recurring work, property tasks, and field updates are loading now."
          badge="Loading routes"
        />
      </div>
    </main>
  );
}
