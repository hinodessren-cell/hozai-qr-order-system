"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      let registration: ServiceWorkerRegistration | undefined;
      const onControllerChange = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      const fingerprint = (documentNode: Document) => Array.from(documentNode.querySelectorAll("script[src],link[rel='stylesheet'][href]"))
        .map((node) => node.getAttribute("src") ?? node.getAttribute("href") ?? "")
        .filter((value) => value.startsWith("/"))
        .sort()
        .join("|");
      const currentFingerprint = fingerprint(document);
      const checkForUpdate = async () => {
        if (document.visibilityState !== "visible" || refreshing) return;
        try {
          await registration?.update();
          const response = await fetch(window.location.pathname, { cache: "no-store", headers: { "x-app-update-check": "1" } });
          if (!response.ok) return;
          const latestDocument = new DOMParser().parseFromString(await response.text(), "text/html");
          const latestFingerprint = fingerprint(latestDocument);
          if (latestFingerprint && latestFingerprint !== currentFingerprint) {
            refreshing = true;
            window.location.reload();
          }
        } catch { /* 次回の自動確認で再試行します */ }
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      void navigator.serviceWorker.register("/sw.js?v=4", { updateViaCache: "none" }).then((current) => { registration = current; return current.update(); });
      const timer = window.setInterval(() => void checkForUpdate(), 30_000);
      const onVisibilityChange = () => { if (document.visibilityState === "visible") void checkForUpdate(); };
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }
  }, []);

  return null;
}
