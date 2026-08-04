"use client";

import { useEffect, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const APP_VERSION = "9.6";

export default function PwaRegister() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [online, setOnline] = useState(true);
  const [standalone, setStandalone] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const applyingUpdate = useRef(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const initializeTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      setStandalone(isStandalone);
      setShowInstall(!isStandalone && window.localStorage.getItem("pwa-install-dismissed") !== "yes");
    }, 0);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setShowInstall(true);
    };
    const onInstalled = () => {
      setStandalone(true);
      setShowInstall(false);
      setInstallPrompt(null);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.clearTimeout(initializeTimer);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("beforeinstallprompt", onInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    let active = true;
    const phoneCameraUse = /iPhone|Android.*Mobile/i.test(navigator.userAgent);
    let suppressRepeat = true;
    window.sessionStorage.removeItem("pwa-update-reload-once");
    const suppressTimer = window.setTimeout(() => { suppressRepeat = false; }, 15_000);
    const announceUpdate = (worker: ServiceWorker | null) => {
      if (applyingUpdate.current) return;
      if (phoneCameraUse) return;
      if (suppressRepeat && worker) {
        applyingUpdate.current = true;
        worker.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      setUpdateAvailable(true);
    };
    const observe = (current: ServiceWorkerRegistration) => {
      if (current.waiting) announceUpdate(current.waiting);
      current.addEventListener("updatefound", () => {
        const worker = current.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdate(worker);
        });
      });
    };
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((current) => {
      if (!active) return;
      setRegistration(current);
      observe(current);
      return current.update();
    });

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void navigator.serviceWorker.getRegistration().then((current) => current?.update());
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void navigator.serviceWorker.getRegistration().then((current) => current?.update());
    };
    const onControllerChange = () => window.location.reload();
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      active = false;
      window.clearTimeout(initializeTimer);
      window.clearTimeout(suppressTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setShowInstall(false);
      setInstallPrompt(null);
      return;
    }
    setShowIosHelp(true);
  };

  const dismissInstall = () => {
    window.localStorage.setItem("pwa-install-dismissed", "yes");
    setShowInstall(false);
  };

  const applyUpdate = async () => {
    if (applyingUpdate.current) return;
    applyingUpdate.current = true;
    setUpdateAvailable(false);
    window.sessionStorage.setItem("pwa-update-reload-once", APP_VERSION);
    const current = registration ?? await navigator.serviceWorker.getRegistration();
    const waiting = current?.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  };

  return <>
    {!online && <aside className="pwaOffline" role="status">オフラインです。通信が戻ると自動的に再接続します。</aside>}
    {updateAvailable && <aside className="pwaUpdate" role="status"><div><b>新しいバージョンがあります</b><small>発注内容を保存してから更新してください。</small></div><button onClick={applyUpdate}>最新版に更新</button></aside>}
    {!standalone && showInstall && <aside className="pwaInstall">
      <button className="pwaDismiss" onClick={dismissInstall} aria-label="インストール案内を閉じる">×</button>
      <div><b>アプリとして使えます</b><small>ホーム画面からすぐに起動できます。</small></div>
      <button className="pwaInstallButton" onClick={() => void install()}>アプリをインストール</button>
      {showIosHelp && <p>iPhone・iPadではSafariの共有ボタンから「ホーム画面に追加」を選んでください。</p>}
      <em>アプリ v{APP_VERSION}</em>
    </aside>}
  </>;
}
