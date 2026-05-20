"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PushStatus = "checking" | "unsupported" | "disabled" | "ready" | "active" | "saving" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

export default function PushNotificationControl() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setStatus("unsupported");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        if (active) {
          setStatus("disabled");
          setMessage("Push setup needs a VAPID public key.");
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        const token = await getAccessToken();

        if (!active) return;

        setSubscription(existing);
        setStatus(existing ? "active" : "ready");

        if (token) {
          const response = await fetch("/api/staff-push-subscription?portal=cleaner", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json().catch(() => null);

          if (active && payload?.subscribed && existing) {
            setStatus("active");
          }
        }
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Push setup failed.");
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  async function enablePush() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;

    try {
      setStatus("saving");
      setMessage("");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("ready");
        setMessage("Notifications are blocked for this browser.");
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Please log in again before enabling notifications.");
      }

      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const response = await fetch("/api/staff-push-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          portal: "cleaner",
          subscription: sub.toJSON(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not save push subscription.");
      }

      setSubscription(sub);
      setStatus("active");
      setMessage("Push notifications are on.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    }
  }

  async function disablePush() {
    try {
      setStatus("saving");
      setMessage("");

      const token = await getAccessToken();
      const endpoint = subscription?.endpoint || "";
      await subscription?.unsubscribe();

      if (token) {
        await fetch("/api/staff-push-subscription", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ portal: "cleaner", endpoint }),
        });
      }

      setSubscription(null);
      setStatus("ready");
      setMessage("Push notifications are off.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not disable notifications.");
    }
  }

  if (status === "checking" || status === "unsupported" || status === "disabled") {
    return null;
  }

  const isActive = status === "active";
  const isBusy = status === "saving";

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#7a5c2e]/35 bg-[#120f0b]/95 p-3 text-[#f5efe4] shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur sm:max-w-xs">
      <div className="flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            isActive ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-[#b08b47]"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {isActive ? "Push on" : status === "error" ? "Push issue" : "Push alerts"}
          </div>
          {message ? <div className="mt-0.5 text-xs text-[#cdbda0]">{message}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => void (isActive ? disablePush() : enablePush())}
          disabled={isBusy}
          className="rounded-full border border-[#b08b47]/55 px-3 py-1.5 text-xs font-semibold text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b] disabled:opacity-50"
        >
          {isBusy ? "Saving" : isActive ? "Turn off" : "Turn on"}
        </button>
      </div>
    </div>
  );
}
