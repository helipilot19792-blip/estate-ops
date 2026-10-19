"use client";

import { useRef, useState, type ReactNode } from "react";
import { getFreshReceiptUrl } from "@/lib/receipt-asset-url";

export function ReceiptLink({
  storage,
  value,
  resolveUrl,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  storage: Parameters<typeof getFreshReceiptUrl>[0];
  value: string;
  resolveUrl?: () => Promise<string>;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const pending = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openReceipt() {
    if (pending.current) return;
    // Open synchronously during the click so browsers allow the new tab.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Allow pop-ups for this portal, then try opening the receipt again.");
      return;
    }
    tab.opener = null;
    pending.current = true;
    setOpening(true);
    setError("");
    try {
      const url = await (resolveUrl ? resolveUrl() : getFreshReceiptUrl(storage, value));
      if (!tab.closed) tab.location.replace(url);
    } catch (openError) {
      tab.close();
      setError(openError instanceof Error ? openError.message : "Could not open the receipt. Please try again or contact support.");
    } finally {
      pending.current = false;
      setOpening(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openReceipt()}
        disabled={opening}
        aria-busy={opening}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>
      {error ? <span role="alert" className="block text-xs">{error}</span> : null}
    </>
  );
}
