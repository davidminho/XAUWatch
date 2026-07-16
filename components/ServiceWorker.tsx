"use client";

import { useEffect, useRef } from "react";

export default function ServiceWorker({ onUpdateAvailable }: { onUpdateAvailable?: () => void }) {
  const updateHandler = useRef(onUpdateAvailable);

  useEffect(() => {
    updateHandler.current = onUpdateAvailable;
  }, [onUpdateAvailable]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      let disposed = false;
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (disposed) return;
        if (registration.waiting) updateHandler.current?.();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) updateHandler.current?.();
          });
        });
      }).catch(() => undefined);
      return () => { disposed = true; };
    }
  }, []);
  return null;
}
