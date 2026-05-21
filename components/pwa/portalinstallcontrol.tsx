"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PushStatus = "checking" | "unsupported" | "disabled" | "ready" | "active" | "saving" | "error";
type AppPortal = "admin" | "cleaner" | "grounds" | "owner";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PortalInstallControlProps = {
  portal?: AppPortal;
  enablePush?: boolean;
};

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

export default function PortalInstallControl({
  portal = "cleaner",
  enablePush = true,
}: PortalInstallControlProps) {
  const [status, setStatus] = useState<PushStatus>(enablePush ? "checking" : "disabled");
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    let active = true;

    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    async function initializeServiceWorker() {
      try {
        if (!("serviceWorker" in navigator)) {
          if (enablePush && active) setStatus("unsupported");
          return null;
        }

        return await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch (error) {
        if (enablePush && active) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "App install setup failed.");
        }
        return null;
      }
    }

    async function initializePush() {
      const registration = await initializeServiceWorker();
      if (!enablePush) return;

      if (!registration || !("PushManager" in window) || !("Notification" in window)) {
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
        const existing = await registration.pushManager.getSubscription();
        const token = await getAccessToken();

        if (!active) return;

        setSubscription(existing);
        setStatus("ready");

        if (token) {
          const response = await fetch(`/api/staff-push-subscription?portal=${portal}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json().catch(() => null);

          if (active && payload?.subscribed && existing) {
            setStatus("active");
          } else if (active && existing && response.ok) {
            const saveResponse = await fetch("/api/staff-push-subscription", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                portal,
                subscription: existing.toJSON(),
              }),
            });
            const savePayload = await saveResponse.json().catch(() => null);
            if (active && saveResponse.ok && savePayload?.ok) {
              setStatus("active");
              setMessage("Alerts are on for this portal.");
            }
          }
        }
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Push setup failed.");
      }
    }

    void initializePush();

    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [enablePush, portal]);

  async function installApp() {
    if (!installPrompt) {
      setShowInstallHelp((current) => !current);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setIsStandalone(true);
      setShowInstallHelp(false);
      if (enablePush && status === "ready") {
        setMessage("One more tap: enable alerts for this device.");
      }
    } else {
      setShowInstallHelp(true);
    }
  }

  async function enablePushNotifications() {
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
          portal,
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
          body: JSON.stringify({ portal, endpoint }),
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

  const canOfferInstall = !isStandalone;
  const canInstall = !!installPrompt && !isStandalone;
  const showIOSInstallHint = isIOS && !isStandalone;
  const canShowPush =
    enablePush && status !== "checking" && status !== "unsupported" && status !== "disabled";

  if (!canOfferInstall && !canShowPush) {
    return null;
  }

  const isActive = status === "active";
  const isBusy = status === "saving";
  const titleText = isActive
    ? "Alerts on"
    : status === "error"
      ? "Alert issue"
      : canOfferInstall
        ? "Install + alerts"
        : "Alerts off";
  const defaultMessage =
    enablePush && !isActive && status === "ready"
      ? canOfferInstall
        ? "Install the app, then enable alerts."
        : "Enable alerts for this device."
      : "";

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#7a5c2e]/35 bg-[#120f0b]/95 p-3 text-[#f5efe4] shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur sm:max-w-xs">
      <div className="flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            isActive ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-[#b08b47]"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{titleText}</div>
          {message || defaultMessage ? (
            <div className="mt-0.5 text-xs text-[#cdbda0]">{message || defaultMessage}</div>
          ) : null}
          {showIOSInstallHint ? (
            <div className="mt-0.5 text-xs text-[#cdbda0]">Use Share, then Add to Home Screen.</div>
          ) : null}
          {showInstallHelp && !showIOSInstallHint ? (
            <div className="mt-0.5 text-xs text-[#cdbda0]">Use the browser menu, then Install app or Add to Home screen.</div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {canOfferInstall ? (
            <button
              type="button"
              onClick={() => void installApp()}
              className="rounded-full border border-[#b08b47]/55 px-3 py-1.5 text-xs font-semibold text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b]"
            >
              {canInstall ? "Install" : "How"}
            </button>
          ) : null}
          {canShowPush ? (
            <button
              type="button"
              onClick={() => void (isActive ? disablePush() : enablePushNotifications())}
              disabled={isBusy}
              className="rounded-full border border-[#b08b47]/55 px-3 py-1.5 text-xs font-semibold text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b] disabled:opacity-50"
            >
              {isBusy ? "Saving" : isActive ? "Turn off" : "Enable alerts"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
