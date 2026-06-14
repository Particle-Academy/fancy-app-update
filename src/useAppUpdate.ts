import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAppUpdateOptions {
  /** Turn detection on/off. Default `true`. */
  enabled?: boolean;
  /** Poll interval in ms. Default `60_000` (1 min). */
  interval?: number;
  /** Also re-check when the tab regains focus / becomes visible. Default `true`. */
  pollOnFocus?: boolean;

  /**
   * Custom detector — resolve `true` when a new build is available. Highest
   * priority; use this for any backend (a `/version` endpoint, a WebSocket flag,
   * a service-worker signal, …).
   */
  check?: () => boolean | Promise<boolean>;

  /**
   * The build version your app is currently running — e.g.
   * `import.meta.env.VITE_BUILD_ID`, a `<meta name="build-id">`, or a constant
   * injected at build time. Compared against {@link latestVersion}.
   */
  currentVersion?: string;
  /** Fetch the deployed build's version. Used together with {@link currentVersion}. */
  latestVersion?: () => string | Promise<string>;

  /**
   * Fallback when neither `check` nor a version pair is given: poll this URL and
   * compare its `ETag` / `Last-Modified` to the value seen on mount. Zero-config
   * for static SPAs — the host's `index.html` headers change on every deploy.
   * Default: the current document URL.
   */
  pingUrl?: string;

  /** Fired once, when an update is first detected. */
  onUpdateAvailable?: () => void;
}

export interface AppUpdate {
  /** True once a newer build has been detected (and not dismissed). */
  updateAvailable: boolean;
  /** Hard reload to pick up the new build. Default action of `<AppUpdateAlert>`. */
  refresh: () => void;
  /** Hide the prompt until the next page load. */
  dismiss: () => void;
  /** Run a check now (the interval/focus pollers call this for you). */
  check: () => Promise<void>;
}

/**
 * Detect when a React app has been redeployed (a new build) while the page is
 * open, so you can prompt the user to refresh. **Framework-agnostic** — no
 * Inertia, no PHP, no specific backend. Choose a detection strategy:
 *
 * 1. **Custom** — `check: () => boolean | Promise<boolean>` (poll your own API).
 * 2. **Version compare** — `currentVersion` + `latestVersion()` (your build id
 *    vs. the deployed one).
 * 3. **ETag** (default) — poll `pingUrl` (the page URL) and compare its
 *    `ETag` / `Last-Modified` to the value on mount. Works for any statically
 *    served SPA with no backend code at all.
 *
 * SSR-safe: nothing runs on the server; all polling lives in effects. Polling
 * stops once an update is detected (or after `dismiss()`).
 */
export function useAppUpdate(options: UseAppUpdateOptions = {}): AppUpdate {
  const {
    enabled = true,
    interval = 60_000,
    pollOnFocus = true,
    check: customCheck,
    currentVersion,
    latestVersion,
    pingUrl,
    onUpdateAvailable,
  } = options;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dismissedRef = useRef(false);
  const firedRef = useRef(false);
  const baselineEtagRef = useRef<string | null>(null);

  // Keep latest callbacks without resubscribing the pollers each render.
  const onUpdateRef = useRef(onUpdateAvailable);
  onUpdateRef.current = onUpdateAvailable;
  const customCheckRef = useRef(customCheck);
  customCheckRef.current = customCheck;
  const latestVersionRef = useRef(latestVersion);
  latestVersionRef.current = latestVersion;

  const detect = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;

    // 1. Custom detector.
    if (customCheckRef.current) {
      return customCheckRef.current();
    }

    // 2. Version compare.
    if (currentVersion != null && latestVersionRef.current) {
      try {
        const latest = await latestVersionRef.current();
        return latest != null && latest !== currentVersion;
      } catch {
        return false;
      }
    }

    // 3. ETag / Last-Modified of the page URL.
    const url = pingUrl ?? window.location.href;
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
      const tag = res.headers.get("etag") ?? res.headers.get("last-modified");
      if (tag == null) return false; // host sends no validators — can't ETag-detect
      if (baselineEtagRef.current == null) {
        baselineEtagRef.current = tag; // first run: capture the baseline
        return false;
      }
      return tag !== baselineEtagRef.current;
    } catch {
      return false; // network blip — never false-positive
    }
  }, [currentVersion, pingUrl]);

  const runCheck = useCallback(async (): Promise<void> => {
    if (!enabled || dismissedRef.current) return;
    const available = await detect();
    if (available && !dismissedRef.current) {
      setUpdateAvailable(true);
      if (!firedRef.current) {
        firedRef.current = true;
        onUpdateRef.current?.();
      }
    }
  }, [enabled, detect]);

  // Interval polling — stops once detected (or disabled).
  useEffect(() => {
    if (!enabled || updateAvailable || typeof window === "undefined") return;
    const id = window.setInterval(() => void runCheck(), interval);
    return () => window.clearInterval(id);
  }, [enabled, interval, runCheck, updateAvailable]);

  // Re-check when the tab regains focus / becomes visible.
  useEffect(() => {
    if (!enabled || !pollOnFocus || updateAvailable || typeof window === "undefined") return;
    const onActive = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [enabled, pollOnFocus, runCheck, updateAvailable]);

  const refresh = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setUpdateAvailable(false);
  }, []);

  const check = useCallback(() => runCheck(), [runCheck]);

  return { updateAvailable, refresh, dismiss, check };
}
