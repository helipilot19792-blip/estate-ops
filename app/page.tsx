export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-3xl border border-yellow-600/30 bg-zinc-950 p-8 shadow-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-yellow-400">
          Estate Ops Portal
        </h1>

        <p className="mt-4 text-zinc-300">
          Deployment is working.
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <a
            href="/admin"
            className="inline-flex items-center justify-center rounded-xl bg-yellow-500 px-5 py-3 font-semibold text-black transition hover:bg-yellow-400"
          >
            Go to Admin
          </a>

          <a
            href="/cleaner"
            className="inline-flex items-center justify-center rounded-xl border border-yellow-600/40 px-5 py-3 font-semibold text-yellow-400 transition hover:bg-yellow-500/10"
          >
            Go to Cleaner
          </a>
        </div>
      </div>
    </main>
  );
}