import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type SafeFetchOptions = {
  accept?: string;
  maxBytes: number;
  timeoutMs?: number;
  userAgent?: string;
};

type SafeFetchResult = {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  status: number;
};

const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const family = isIP(normalized);

  if (family === 4) return isPrivateIpv4(normalized);
  if (family !== 6) return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

async function assertPublicHttpsUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Remote URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Remote URL must use HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Remote URL credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Remote URL host is not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Remote URL host is not public.");
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Remote URL host is not public.");
  }

  return url;
}

export async function fetchPublicBytes(
  rawUrl: string,
  options: SafeFetchOptions
): Promise<SafeFetchResult> {
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 12_000, 30_000));
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const url = await assertPublicHttpsUrl(currentUrl);
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: options.accept || "*/*",
        "User-Agent": options.userAgent || "gulera-safe-fetch",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("Remote URL redirected too many times.");
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Remote fetch failed with status ${response.status}.`);
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      throw new Error("Remote response is too large.");
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > options.maxBytes) {
      throw new Error("Remote response is too large.");
    }

    return {
      bytes,
      contentType: response.headers.get("content-type") || "",
      finalUrl: url.toString(),
      status: response.status,
    };
  }

  throw new Error("Remote fetch failed.");
}

export async function fetchPublicText(rawUrl: string, options: SafeFetchOptions) {
  const result = await fetchPublicBytes(rawUrl, options);
  return {
    ...result,
    text: new TextDecoder().decode(result.bytes),
  };
}
