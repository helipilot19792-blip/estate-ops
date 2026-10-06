import "server-only";

import { requireOrganizationAdmin } from "@/lib/server/organization-access";

// Preview access always requires membership in the selected organization,
// including for platform admins. A target's other organizations are never used.
export async function requirePortalPreviewAdmin(service: any, userId: string, organizationId: string) {
  const profile = await requireOrganizationAdmin(service, userId, organizationId);
  const { data, error } = await service.from("organization_members")
    .select("profile_id").eq("organization_id", organizationId)
    .eq("profile_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Admin membership in this organization is required."), { code: "FORBIDDEN" });
  return profile;
}

export async function requirePreviewAccount(service: any, organizationId: string, portal: "cleaner" | "owner", accountId: string) {
  const table = portal === "cleaner" ? "cleaner_accounts" : "owner_accounts";
  const { data, error } = await service.from(table).select("*")
    .eq("organization_id", organizationId).eq("id", accountId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Account was not found in this organization."), { code: "NOT_FOUND" });
  return data;
}

export async function loadOwnerPreviewDashboard(service: any, organizationId: string, account: any) {
  const access = await service.from("owner_property_access").select("property_id").eq("owner_account_id", account.id);
  if (access.error) throw new Error(access.error.message);
  const ids = (access.data ?? []).map((row: { property_id: string }) => row.property_id);
  const properties = ids.length ? await service.from("properties").select("*")
    .eq("organization_id", organizationId).in("id", ids).order("created_at", { ascending: false }) : { data: [], error: null };
  if (properties.error) throw new Error(properties.error.message);
  const propertyIds = (properties.data ?? []).map((row: { id: string }) => row.id);
  const start = new Date(); start.setDate(start.getDate() - 400);
  const end = new Date(); end.setDate(end.getDate() + 540);
  const empty = Promise.resolve({ data: [], error: null });
  const results = await Promise.all([
    propertyIds.length ? service.from("turnover_jobs").select("id,property_id,status,notes,created_at,scheduled_for").eq("organization_id", organizationId).in("property_id", propertyIds).order("created_at", { ascending: false }) : empty,
    propertyIds.length ? service.from("property_booking_events").select("id,property_id,source,summary,guest_count,checkin_date,checkout_date,created_at").in("property_id", propertyIds).gte("checkout_date", start.toISOString().slice(0, 10)).lte("checkin_date", end.toISOString().slice(0, 10)).order("checkin_date", { ascending: false }) : empty,
    propertyIds.length ? service.from("grounds_jobs").select("id,property_id,status,notes,created_at,scheduled_for,job_type").eq("organization_id", organizationId).in("property_id", propertyIds).order("created_at", { ascending: false }) : empty,
    propertyIds.length ? service.from("property_grounds_recurring_rules").select("id,property_id,task_type,label,notes,frequency_type,interval_days,day_of_week,day_of_month,semi_monthly_day_1,semi_monthly_day_2,anchor_date,start_date,end_date,next_run_date,active").in("property_id", propertyIds).order("created_at", { ascending: false }) : empty,
    propertyIds.length ? service.from("owner_invoices").select("id,owner_account_id,property_id,invoice_number,status,issue_date,due_date,company_name,logo_url,header_text,notes,payment_instructions,currency_code,corrected_invoice_number,tax_lines,line_items,subtotal,tax_total,total,sent_at,owner_viewed_at").eq("organization_id", organizationId).eq("owner_account_id", account.id).in("status", ["sent", "paid"]).order("issue_date", { ascending: false }) : empty,
    propertyIds.length ? service.from("owner_invoice_hidden_items").select("*").eq("owner_account_id", account.id) : empty,
    propertyIds.length ? service.from("property_maintenance_flags").select("id,property_id,source,category,urgency,status,notes,owner_visible_at,owner_notified_at,created_at,flagged_at,resolved_at").in("property_id", propertyIds).or("source.eq.owner,owner_visible_at.not.is.null").order("created_at", { ascending: false }) : empty,
  ]);
  for (const [index, result] of results.entries()) {
    if (!result.error) continue;
    if ([1, 5].includes(index) && ["PGRST205", "42P01"].includes(result.error.code)) continue;
    throw new Error(result.error.message);
  }
  const [turnoverJobs, bookingEvents, groundsJobs, groundsRecurringRules, ownerInvoices, ownerInvoiceHiddenItems, flags] = results.map(result => result.data ?? []);
  // An invoice may have no property, but cannot reference a property in another org.
  const allowedProperties = new Set(propertyIds);
  const scopedInvoices = ownerInvoices.filter((invoice: { property_id: string | null }) => !invoice.property_id || allowedProperties.has(invoice.property_id));
  const flagIds = flags.map((flag: { id: string }) => flag.id);
  const images = flagIds.length ? await service.from("property_maintenance_flag_images")
    .select("id,flag_id,image_url,caption,sort_order").in("flag_id", flagIds).order("sort_order", { ascending: true }) : { data: [] };
  return { account, properties: properties.data ?? [], turnoverJobs, bookingEvents, groundsJobs, groundsRecurringRules,
    ownerInvoices: scopedInvoices, ownerInvoiceHiddenItems, flags, flagImages: images.data ?? [] };
}
