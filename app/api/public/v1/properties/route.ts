import { publicPublishingGet } from "@/lib/server/website-publishing";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return publicPublishingGet(request); }
