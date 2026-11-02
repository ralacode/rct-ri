import { fetchAuthStatus, isAuthPage } from "@/lib/auth";
import { go } from "@/lib/nav";

const DATA_CHANGED = "rct-data-changed";

export function startLiveUpdates() {
  if (typeof window === "undefined" || window.__rctLiveStarted) return;
  window.__rctLiveStarted = true;

  const connect = () => {
    const source = new EventSource("/api/events");
    const dispatch = () => {
      window.dispatchEvent(new Event(DATA_CHANGED));
    };
    source.addEventListener("data-changed", dispatch);
    source.onerror = () => {
      if (source.readyState !== EventSource.CLOSED) return;
      void fetchAuthStatus()
        .then((status) => {
          if (status.authenticated) {
            window.setTimeout(connect, 2000);
            return;
          }
          window.__rctLiveStarted = false;
          if (!isAuthPage()) {
            go("/login/");
          }
        })
        .catch(() => {
          window.setTimeout(connect, 2000);
        });
    };
  };

  connect();
}

export function onDataChanged(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  startLiveUpdates();
  window.addEventListener(DATA_CHANGED, callback);
  return () => window.removeEventListener(DATA_CHANGED, callback);
}
