const STORAGE_REFERENCE_PREFIX = "storage://";

export type StorageReference = {
  bucket: string;
  path: string;
};

function cleanPart(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function createStorageReference(bucket: string, path: string) {
  const cleanBucket = cleanPart(bucket);
  const cleanPath = cleanPart(path);
  if (!cleanBucket || !cleanPath) throw new Error("Storage bucket and path are required.");
  return `${STORAGE_REFERENCE_PREFIX}${cleanBucket}/${cleanPath}`;
}

export function parseStorageReference(value: string | null | undefined): StorageReference | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.startsWith(STORAGE_REFERENCE_PREFIX)) {
    const remainder = raw.slice(STORAGE_REFERENCE_PREFIX.length);
    const separator = remainder.indexOf("/");
    if (separator <= 0 || separator === remainder.length - 1) return null;
    return {
      bucket: decodeURIComponent(remainder.slice(0, separator)),
      path: remainder.slice(separator + 1).split("/").map(decodeURIComponent).join("/"),
    };
  }

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
      bucket: decodeURIComponent(match[1]),
      path: match[2].split("/").map(decodeURIComponent).join("/"),
    };
  } catch {
    return null;
  }
}

export function isStorageReference(value: string | null | undefined) {
  return String(value || "").trim().startsWith(STORAGE_REFERENCE_PREFIX);
}
