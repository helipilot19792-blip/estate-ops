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

  const response = await fetch("/api/staff-maintenance-flag", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      propertyId: input.propertyId,
      source: input.source,
      category: input.category,
      urgency: input.urgency,
      notes: input.notes,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Failed to create issue.");
  }

  if ((input.files?.length || 0) > 0 && payload?.flag?.id) {
    const uploadFormData = new FormData();
    uploadFormData.set("flagId", String(payload.flag.id));
    uploadFormData.set("propertyId", input.propertyId);
    uploadFormData.set("source", input.source);

    for (const file of input.files || []) {
      uploadFormData.append("files", file);
    }

    void fetch("/api/staff-maintenance-flag", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: uploadFormData,
    }).catch((uploadError) => {
      console.error("Maintenance image upload failed.", uploadError);
    });
  }

  return payload;
}
