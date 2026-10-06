import {createServiceRoleClient} from "@/lib/server/request-auth";
import {announcementStore,processAnnouncements} from "@/lib/server/company-announcements";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
// Prepared only. No automatic schedule is enabled by this change.
export async function GET(request:Request) {
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  if(!process.env.RESEND_API_KEY)return Response.json({error:"Email service is not configured."},{status:503});
  if(process.env.COMPANY_ANNOUNCEMENTS_EMAIL_ENABLED!=="true")return Response.json({error:"Live announcement email is disabled."},{status:503});
  try{return Response.json(await processAnnouncements(announcementStore(createServiceRoleClient()),null,null));}
  catch{return Response.json({error:"Email processing is unavailable. Queued recipients remain recoverable."},{status:503});}
}
