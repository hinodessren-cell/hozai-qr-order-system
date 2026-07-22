"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      const onControllerChange = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      void navigator.serviceWorker.register("/sw.js?v=4", { updateViaCache: "none" }).then((registration) => registration.update());
      return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    }
  }, []);

  return null;
}
