import { supabase } from "@/lib/supabase";

type ReportStaffMaintenanceIssueInput = {
  propertyId: string;
  source: "cleaner" | "grounds";
  category: string;
  urgency: string;
  notes: string;
  files?: File[];
};

export async function reportStaffMaintenanceIssue(input: ReportStaffMaintenanceIssueInput) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Please sign in again before reporting an issue.");
  }

  const formData = new FormData();
  formData.set("propertyId", input.propertyId);
  formData.set("source", input.source);
  formData.set("category", input.category);
  formData.set("urgency", input.urgency);
  formData.set("notes", input.notes);

  for (const file of input.files || []) {
    formData.append("files", file);
  }

  const response = await fetch("/api/staff-maintenance-flag", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Failed to create issue.");
  }

  return payload;
}
