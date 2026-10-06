import { adminPublishingGet, adminPublishingPost, publishingError } from "@/lib/server/website-publishing";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {try {return Response.json(await adminPublishingGet(request),{headers:{"Cache-Control":"no-store"}});}catch(error){return publishingError(error);}}
export async function POST(request: Request) {try {return Response.json(await adminPublishingPost(request));}catch(error){return publishingError(error);}}
