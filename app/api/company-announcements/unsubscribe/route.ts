import {createServiceRoleClient} from "@/lib/server/request-auth";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  try {
    const p=await request.json();
    if(typeof p.token!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.token))return Response.json({error:"Use the preferences link from your email."},{status:400});
    const r=await createServiceRoleClient().rpc("unsubscribe_company_announcements",{p_token:p.token});
    if(r.error)throw r.error;
    // Do not expose the recipient's email, company, or whether a token exists.
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Could not update email preferences. Please try again."},{status:503});}
}
