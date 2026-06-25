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

const DEFAULT_VAPID_PUBLIC_KEY = "BMqODVFZyHzmPlYyb_nlVwHA2HacRBq7V1O5j-_4jFNj368GIDjqX5vrCytVoOxkWSSKo8zsO6tgTrCwT2TTGe4";

function isValidVapidPublicKey(value?: string | null) {
  const key = String(value || "").trim();
  if (!key || key.startsWith("sk_")) return false;

  try {
    const decoded = urlBase64ToUint8Array(key);
    return decoded.length === 65 && decoded[0] === 4;
  } catch {
    return false;
  }
}

function getBrowserVapidPublicKey(...values: Array<string | null | undefined>) {
  return values.find(isValidVapidPublicKey) || DEFAULT_VAPID_PUBLIC_KEY;
}

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

function isInstalledAppExperience() {
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone =
    "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return standaloneMedia || navigatorStandalone;
}

function detectMobileBrowser() {
  const ua = navigator.userAgent || "";
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  const isEdgiOS = /EdgiOS/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || (isIPhoneOrIPad && /Safari/i.test(ua) && !isCriOS && !isFxiOS && !isEdgiOS);

  return {
    isIPhoneOrIPad,
    isAndroid,
    isSafari,
    label: isCriOS ? "Chrome" : isFxiOS ? "Firefox" : isEdgiOS ? "Edge" : isSafari ? "Safari" : "browser",
  };
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

async function loadPushStatus(portal: AppPortal, token?: string) {
  const response = await fetch(`/api/staff-push-subscription?portal=${portal}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const payload = await response.json().catch(() => null);

  return { response, payload };
}

async function loadCurrentDevicePushStatus(portal: AppPortal, token: string, endpoint?: string | null) {
  const query = new URLSearchParams({ portal });
  if (endpoint) query.set("endpoint", endpoint);

  const response = await fetch(`/api/staff-push-subscription?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);

  return { response, payload };
}

async function savePushSubscription(portal: AppPortal, token: string, pushSubscription: PushSubscription) {
  const response = await fetch("/api/staff-push-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      portal,
      subscription: pushSubscription.toJSON(),
    }),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

export default function PortalInstallControl({
  portal = "cleaner",
  enablePush = true,
}: PortalInstallControlProps) {
  const [status, setStatus] = useState<PushStatus>(enablePush ? "checking" : "disabled");
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [browserLabel, setBrowserLabel] = useState("browser");
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    let active = true;

    setIsStandalone(isInstalledAppExperience());
    const browser = detectMobileBrowser();
    setIsIOS(browser.isIPhoneOrIPad);
    setIsSafari(browser.isSafari);
    setBrowserLabel(browser.label);

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
        if (active) {
          setStatus("unsupported");
          setMessage("This browser does not support web push alerts here.");
        }
        return;
      }

      try {
        const existing = await registration.pushManager.getSubscription();
        const token = await getAccessToken();
        let publicKey = getBrowserVapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

        if (!active) return;

        setSubscription(existing);
        setStatus("ready");

        const { response, payload } = token
          ? await loadCurrentDevicePushStatus(portal, token, existing?.endpoint)
          : await loadPushStatus(portal, token);
        publicKey = getBrowserVapidPublicKey(payload?.publicKey, publicKey);

        if (active && publicKey) {
          setVapidPublicKey(publicKey);
        }

        if (token) {
          if (active && payload?.subscribed && existing) {
            setStatus("active");
          } else if (active && existing && response.ok) {
            const { response: saveResponse, payload: savePayload } = await savePushSubscription(portal, token, existing);
            if (active && saveResponse.ok && savePayload?.ok) {
              setStatus("active");
              setMessage("Alerts are on for this portal.");
            }
          } else if (
            active &&
            !existing &&
            response.ok &&
            publicKey &&
            Notification.permission === "granted"
          ) {
            const restoredSubscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            const { response: saveResponse, payload: savePayload } = await savePushSubscription(
              portal,
              token,
              restoredSubscription
            );
            if (active && saveResponse.ok && savePayload?.ok) {
              setSubscription(restoredSubscription);
              setStatus("active");
              setMessage("Alerts are on for this device.");
            }
          }
        }

        if (active && !publicKey) {
          setStatus("disabled");
          setMessage("Alerts need a VAPID_PUBLIC_KEY environment variable on the server.");
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

  async function copyCurrentLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Link copied. Open Safari, paste it, then add the app to your Home Screen.");
      setShowInstallHelp(true);
    } catch {
      setMessage("Copy did not work here. Use the browser share menu and open this page in Safari.");
      setShowInstallHelp(true);
    }
  }

  async function enablePushNotifications() {
    let publicKey = getBrowserVapidPublicKey(vapidPublicKey, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (!publicKey) {
      try {
        setStatus("saving");
        const token = await getAccessToken();
        const { payload } = await loadPushStatus(portal, token);
        const serverPublicKey = isValidVapidPublicKey(payload?.publicKey) ? payload.publicKey : "";
        if (serverPublicKey) {
          publicKey = serverPublicKey;
          setVapidPublicKey(serverPublicKey);
        } else {
          setStatus("disabled");
          setMessage("Alerts need a VAPID_PUBLIC_KEY environment variable on the server.");
          return;
        }
      } catch {
        setStatus("disabled");
        setMessage("Alerts need a VAPID_PUBLIC_KEY environment variable on the server.");
        return;
      }
    }

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

      const { response, payload } = await savePushSubscription(portal, token, sub);
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
  const installRequiresManualSteps = showIOSInstallHint || (canOfferInstall && !canInstall);
  const canShowPush = enablePush && status !== "checking";
  const canTogglePush =
    canShowPush &&
    status !== "unsupported" &&
    status !== "disabled" &&
    !(showIOSInstallHint && !isStandalone);
  const isActive = status === "active";

  if (isActive) {
    return null;
  }

  if (!canOfferInstall && !canShowPush) {
    return null;
  }

  const isBusy = status === "saving";
  const titleText = isActive
    ? "Alerts on"
    : status === "error"
      ? "Alert issue"
      : status === "unsupported"
        ? showIOSInstallHint
          ? "Get phone alerts"
          : "Alerts unavailable"
        : status === "disabled"
          ? "Alerts setup needed"
          : canOfferInstall
            ? showIOSInstallHint
              ? "Get phone alerts"
              : "Install + alerts"
            : "Alerts off";
  const defaultMessage =
    enablePush && !isActive && (status === "ready" || status === "error")
      ? canOfferInstall
        ? showIOSInstallHint
          ? isSafari
            ? "Add this app to your Home Screen, then open it from there to turn on alerts."
            : `iPhone alerts only work in Safari. Open this page in Safari, then add it to your Home Screen.`
          : "Install the app, then enable alerts."
        : "Enable alerts for this device."
      : "";

  const shouldShowInstallSteps = showIOSInstallHint && (showInstallHelp || !isSafari || status === "unsupported");
  const showCopyLinkButton = showIOSInstallHint && !isSafari;

  return (
    <div className="fixed bottom-4 left-4 z-[110] max-w-[calc(100vw-2rem)] rounded-[24px] border border-[#7a5c2e]/40 bg-[#120f0b]/96 p-4 text-[#f5efe4] shadow-[0_20px_50px_rgba(0,0,0,0.32)] backdrop-blur sm:max-w-sm">
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 h-3 w-3 rounded-full ${
            isActive ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-[#c89a49]"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold leading-5">{titleText}</div>
          {message || defaultMessage ? (
            <div className="mt-1 text-sm leading-5 text-[#ddd0bc]">{message || defaultMessage}</div>
          ) : null}

          {shouldShowInstallSteps ? (
            <div className="mt-3 rounded-[20px] border border-[#7a5c2e]/45 bg-[#1a1510] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c89a49]">
                iPhone setup
              </div>
              <div className="mt-2 space-y-2 text-sm leading-5 text-[#f5efe4]">
                {!isSafari ? <div>1. Open this page in Safari. Right now you are in {browserLabel}.</div> : null}
                <div>{isSafari ? "1." : "2."} Tap the Share button in Safari.</div>
                <div>{isSafari ? "2." : "3."} Tap <span className="font-semibold">Add to Home Screen</span>.</div>
                <div>{isSafari ? "3." : "4."} Open the new app from your Home Screen.</div>
                <div>{isSafari ? "4." : "5."} Come back here and tap <span className="font-semibold">Enable alerts</span>.</div>
              </div>
            </div>
          ) : null}

          {showInstallHelp && !showIOSInstallHint ? (
            <div className="mt-2 text-xs text-[#cdbda0]">Use the browser menu, then Install app or Add to Home screen.</div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {canOfferInstall ? (
              <button
                type="button"
                onClick={() => void installApp()}
                className="rounded-full border border-[#b08b47]/55 px-3.5 py-2 text-sm font-semibold text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b]"
              >
                {canInstall ? "Install app" : showIOSInstallHint ? (isSafari ? "Show iPhone steps" : "How to use Safari") : installRequiresManualSteps ? "Install guide" : "How"}
              </button>
            ) : null}

            {showCopyLinkButton ? (
              <button
                type="button"
                onClick={() => void copyCurrentLink()}
                className="rounded-full border border-[#d8c7ab]/45 px-3.5 py-2 text-sm font-semibold text-[#f5efe4] transition hover:bg-white hover:text-[#120f0b]"
              >
                Copy link
              </button>
            ) : null}

            {canShowPush && canTogglePush ? (
              <button
                type="button"
                onClick={() => void (isActive ? disablePush() : enablePushNotifications())}
                disabled={isBusy}
                className="rounded-full border border-[#b08b47]/55 bg-[#f0c97a] px-3.5 py-2 text-sm font-semibold text-[#120f0b] transition hover:bg-[#f6d796] disabled:opacity-50"
              >
                {isBusy
                  ? "Saving"
                  : isActive
                    ? "Turn off alerts"
                    : "Enable alerts"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
