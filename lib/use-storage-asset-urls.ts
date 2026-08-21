"use client";

import { useEffect, useMemo, useState } from "react";
import { isStorageReference, parseStorageReference } from "@/lib/storage-reference";

export function useStorageAssetUrls(
  storage: { from: (bucket: string) => any },
  values: Array<string | null | undefined>,
  expiresInSeconds = 60 * 60
) {
  const key = values.map((value) => String(value || "").trim()).filter(Boolean).sort().join("\u0000");
  const references = useMemo(
    () => [...new Set(key.split("\u0000").filter((value) => parseStorageReference(value)))],
    [key]
  );
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (references.length === 0) return;

    void Promise.all(
      references.map(async (value) => {
        const reference = parseStorageReference(value)!;
        const { data, error } = await storage
          .from(reference.bucket)
          .createSignedUrl(reference.path, expiresInSeconds);
        if (error || !data?.signedUrl) return null;
        return [value, data.signedUrl] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setResolved((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry)),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [expiresInSeconds, references, storage]);

  return (value: string | null | undefined) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (resolved[raw]) return resolved[raw];
    return isStorageReference(raw) ? "" : raw;
  };
}
