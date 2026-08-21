import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchPublicBytes } from "@/lib/server/safe-remote-fetch";
import { parseStorageReference } from "@/lib/storage-reference";

type DownloadOptions = {
  accept?: string;
  maxBytes: number;
  timeoutMs?: number;
  userAgent?: string;
};

function contentTypeAllowed(contentType: string, accept?: string) {
  if (!accept || !contentType) return true;
  return accept.split(",").some((entry) => {
    const wanted = entry.trim().toLowerCase();
    if (!wanted || wanted === "*/*") return true;
    if (wanted.endsWith("/*")) return contentType.startsWith(wanted.slice(0, -1));
    return contentType === wanted;
  });
}

export async function downloadStorageAsset(
  service: any,
  value: string,
  options: DownloadOptions
) {
  const reference = parseStorageReference(value);
  if (!reference) {
    return fetchPublicBytes(value, options);
  }

  const { data, error } = await service.storage.from(reference.bucket).download(reference.path);
  if (error || !data) throw new Error(error?.message || "Stored asset could not be downloaded.");
  if (data.size > options.maxBytes) throw new Error("Stored asset exceeds the allowed size.");

  const contentType = String(data.type || "application/octet-stream").toLowerCase();
  if (!contentTypeAllowed(contentType, options.accept)) {
    throw new Error("Stored asset has an unsupported content type.");
  }

  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType };
}

export async function downloadStorageAssetWithServiceRole(
  value: string,
  options: DownloadOptions
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Storage service is not configured.");
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return downloadStorageAsset(service, value, options);
}

export async function createSignedStorageAssetUrl(
  service: any,
  value: string | null | undefined,
  expiresInSeconds = 60 * 60
) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const reference = parseStorageReference(raw);
  if (!reference) return raw;

  const { data, error } = await service.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not sign stored asset.");
  return data.signedUrl;
}
