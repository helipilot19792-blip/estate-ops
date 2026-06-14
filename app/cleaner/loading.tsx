import PortalLoadingScene from "@/components/portal/portal-loading-scene";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0f0d0a] px-4 py-6 text-[#241c15] md:px-6">
      <div className="mx-auto max-w-7xl">
        <PortalLoadingScene
          eyebrow="Cleaner portal"
          title="Rolling into the cleaning board."
          body="Assigned cleanings, access details, and checklist progress are loading now. The mower is keeping things tidy while the cleaner portal wakes up."
          badge="Loading jobs"
        />
      </div>
    </main>
  );
}
