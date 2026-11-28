import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "denewstock_pwa_banner_dismissed_v1";

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function detectIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS =
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

function detectAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

export interface PWAInstallState {
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  hasNativePrompt: boolean;
  bannerDismissed: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "manual">;
  dismissBanner: () => void;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    detectStandalone()
  );
  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isAndroid] = useState<boolean>(() => detectAndroid());
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayChange = () => setIsStandalone(detectStandalone());
    mediaQuery.addEventListener?.("change", handleDisplayChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener?.("change", handleDisplayChange);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "manual"
  > => {
    if (!deferredPrompt) {
      return "manual";
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
      return outcome;
    } catch {
      return "manual";
    }
  }, [deferredPrompt]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    isStandalone,
    isIOS,
    isAndroid,
    hasNativePrompt: deferredPrompt !== null,
    bannerDismissed,
    promptInstall,
    dismissBanner,
  };
}
