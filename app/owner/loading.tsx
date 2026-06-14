import PortalLoadingScene from "@/components/portal/portal-loading-scene";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0f0d0a] px-4 py-6 text-[#241c15] md:px-6">
      <div className="mx-auto max-w-7xl">
        <PortalLoadingScene
          eyebrow="Owner portal"
          title="Rolling into the owner dashboard."
          body="Bookings, invoices, and property updates are loading now. The mower is doing a quick pass while the owner portal gets settled."
          badge="Loading updates"
        />
      </div>
    </main>
  );
}
