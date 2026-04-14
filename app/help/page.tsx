"use client";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#0e0e0e] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-10">

        <h1 className="text-3xl font-semibold">
          Gulera OS Help Center
        </h1>

        {/* QUICK START */}
        <section>
          <h2 className="text-xl font-semibold mb-3">🚀 Quick Start</h2>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>1. Go to Admin Dashboard</li>
            <li>2. Create your first property</li>
            <li>3. Assign cleaners or grounds staff</li>
            <li>4. Jobs will start appearing automatically</li>
            <li>5. Staff can accept jobs from their mobile view</li>
          </ul>
        </section>

        {/* ADMIN */}
        <section>
          <h2 className="text-xl font-semibold mb-3">🧠 Admin Guide</h2>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• Add and manage properties</li>
            <li>• View today's schedule and upcoming jobs</li>
            <li>• Assign cleaners and grounds staff</li>
            <li>• Monitor job status and issues</li>
            <li>• Respond to alerts and stranded jobs</li>
          </ul>
        </section>

        {/* CLEANER */}
        <section>
          <h2 className="text-xl font-semibold mb-3">🧼 Cleaner Guide</h2>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• View available jobs</li>
            <li>• Accept a job to start work</li>
            <li>• Follow checklist (if provided)</li>
            <li>• Mark job as complete</li>
            <li>• Report issues if needed</li>
          </ul>
        </section>

        {/* GROUNDS */}
        <section>
          <h2 className="text-xl font-semibold mb-3">🌿 Grounds / Maintenance</h2>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• View assigned tasks</li>
            <li>• Complete recurring or scheduled work</li>
            <li>• Report maintenance issues</li>
            <li>• Track ongoing property needs</li>
          </ul>
        </section>

        {/* SUPPORT */}
        <section>
          <h2 className="text-xl font-semibold mb-3">🆘 Need Help?</h2>
          <p className="text-gray-300 text-sm">
            Use the support button in the app to report an issue.
            Your request will be sent directly to the admin team.
          </p>
        </section>

      </div>
    </main>
  );
}