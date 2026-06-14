import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAppUpdate, type UseAppUpdateOptions } from "./useAppUpdate";

interface AppUpdateApi {
  /** Reload to pick up the new build (or your `onRefresh`). */
  refresh: () => void;
  /** Hide the prompt until the next page load. */
  dismiss: () => void;
}

export type AppUpdateAlertPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom"
  | "top";

export interface AppUpdateAlertProps extends UseAppUpdateOptions {
  /** Heading. Default `"Update available"`. */
  title?: ReactNode;
  /** Body copy. Default `"A new version is available — refresh to get the latest."`. */
  description?: ReactNode;
  /** Refresh button label. Default `"Refresh"`. */
  refreshLabel?: ReactNode;
  /** Dismiss button label. Default `"Later"`. */
  dismissLabel?: ReactNode;
  /** Fixed position of the default prompt. Default `"bottom-right"`. */
  position?: AppUpdateAlertPosition;
  /** Accent / button color (any CSS color). Default `"#7c3aed"`. */
  accent?: string;
  /** Class on the prompt container, for your own styling. */
  className?: string;
  /** Customize the refresh action (default: hard `window.location.reload()`). */
  onRefresh?: () => void;
  /**
   * Full UX override — render your own alert instead of the built-in one.
   * Receives `{ refresh, dismiss }`; only rendered when an update is available.
   */
  render?: (api: AppUpdateApi) => ReactNode;
  /** Alternate render-prop form of {@link render}. */
  children?: (api: AppUpdateApi) => ReactNode;
}

const POSITION: Record<AppUpdateAlertPosition, CSSProperties> = {
  "bottom-right": { bottom: 16, right: 16 },
  "bottom-left": { bottom: 16, left: 16 },
  "top-right": { top: 16, right: 16 },
  "top-left": { top: 16, left: 16 },
  bottom: { bottom: 16, left: "50%", transform: "translateX(-50%)" },
  top: { top: 16, left: "50%", transform: "translateX(-50%)" },
};

/**
 * Drop-in "a new version is available — refresh" prompt for any React app.
 * Detects a redeploy via {@link useAppUpdate} and shows a small, self-contained,
 * dismissible card with a Refresh button — **no external UI library, no
 * framework**. Mount once near your app root; it renders nothing until an update
 * is detected.
 *
 * ```tsx
 * <AppUpdateAlert />                                                   // ETag default
 * <AppUpdateAlert currentVersion={BUILD_ID} latestVersion={() => fetch("/version").then(r => r.text())} />
 * <AppUpdateAlert check={async () => (await api.hasUpdate())} position="bottom" />
 * <AppUpdateAlert render={({ refresh }) => <MyBanner onRefresh={refresh} />} />  // your own UI
 * ```
 */
export function AppUpdateAlert({
  title = "Update available",
  description = "A new version is available — refresh to get the latest.",
  refreshLabel = "Refresh",
  dismissLabel = "Later",
  position = "bottom-right",
  accent = "#7c3aed",
  className,
  onRefresh,
  render,
  children,
  ...hookOptions
}: AppUpdateAlertProps) {
  const { updateAvailable, refresh, dismiss } = useAppUpdate(hookOptions);

  if (!updateAvailable || typeof document === "undefined") return null;

  const doRefresh = onRefresh ?? refresh;
  const api: AppUpdateApi = { refresh: doRefresh, dismiss };

  const custom = render ?? children;
  if (custom) return <>{custom(api)}</>;

  const node = (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        position: "fixed",
        zIndex: 2147483000,
        maxWidth: "min(92vw, 24rem)",
        ...POSITION[position],
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        borderRadius: 12,
        background: "#ffffff",
        color: "#18181b",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "12px 14px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 14,
        lineHeight: 1.4,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div>
        {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
        {description ? <div style={{ opacity: 0.8, marginTop: 2 }}>{description}</div> : null}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={dismiss}
          style={{
            cursor: "pointer",
            background: "transparent",
            border: "none",
            color: "inherit",
            opacity: 0.7,
            font: "inherit",
            padding: "6px 10px",
            borderRadius: 8,
          }}
        >
          {dismissLabel}
        </button>
        <button
          type="button"
          onClick={doRefresh}
          style={{
            cursor: "pointer",
            background: accent,
            color: "#ffffff",
            border: "none",
            font: "inherit",
            fontWeight: 600,
            padding: "6px 14px",
            borderRadius: 8,
          }}
        >
          {refreshLabel}
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

AppUpdateAlert.displayName = "AppUpdateAlert";
