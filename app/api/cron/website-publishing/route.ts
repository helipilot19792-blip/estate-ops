import {createServiceRoleClient} from "@/lib/server/request-auth";
import {runWebsiteWorker,supabaseWebsiteWorkerStore} from "@/lib/server/website-sync-worker";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
/** Prepared, not scheduled in vercel.json. No paid scheduler or external transport is enabled. */
export async function GET(request:Request) {
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`) return Response.json({error:"Unauthorized"},{status:401});
  try {return Response.json(await runWebsiteWorker(supabaseWebsiteWorkerStore(createServiceRoleClient()),{org:null}));}
  catch {return Response.json({error:"Publishing worker persistence unavailable. Leased jobs remain recoverable."},{status:503});}
}
