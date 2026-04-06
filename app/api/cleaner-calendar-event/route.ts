import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function formatDateToICS(dateStr: string) {
  // dateStr = "2026-04-23"
  const d = new Date(dateStr + "T11:00:00");

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}${mm}${dd}T${hh}${min}00`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  const { data: job } = await supabase
    .from("turnover_jobs")
    .select("id, scheduled_for, notes, property_id")
    .eq("id", jobId)
    .single();

  if (!job || !job.scheduled_for) {
    return new Response("Job not found", { status: 404 });
  }

  const { data: property } = await supabase
    .from("properties")
    .select("name, address")
    .eq("id", job.property_id)
    .single();

  const start = formatDateToICS(job.scheduled_for);

  // end = +1 minute
  const endDate = new Date(job.scheduled_for + "T11:01:00");
  const end = formatDateToICS(
    endDate.toISOString().slice(0, 10)
  );

  const title = `Cleaning – ${property?.name || "Property"}`;
  const description = job.notes || "";
  const location = property?.address || "";

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:${job.id}
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": `attachment; filename=cleaning-${job.id}.ics`,
    },
  });
}