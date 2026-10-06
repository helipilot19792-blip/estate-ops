import {getAnnouncements,postAnnouncement} from "@/lib/server/company-announcements";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
export const GET=getAnnouncements;
export const POST=postAnnouncement;
