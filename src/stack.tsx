/**
 * @particle-academy/fancy-app-update/stack
 *
 * The stacked variant of the refresh prompt: when a new build lands, the
 * release's feature cards stack behind each other (react-fancy's `Toast.Stack`
 * -- scroll or arrow keys walk through them), each with a close button and a
 * "Refresh to get the latest" action.
 *
 * A separate entry because it is built from react-fancy, an OPTIONAL peer: the
 * package root stays dependency-free for apps that only want the detector.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Portal, Toast, type ButtonColor } from "@particle-academy/react-fancy";
import { useAppUpdate, type UseAppUpdateOptions } from "./useAppUpdate";
import { POSITION, type AppUpdateAlertPosition } from "./position";

/** One card of an update message: what changed in this release. */
export interface AppUpdateFeature {
  /** Stable key. Defaults to the card's position. */
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Shown full width as the card's header. */
  image?: string;
  imageAlt?: string;
}

export type AppUpdateFeatures =
  | readonly AppUpdateFeature[]
  | (() => readonly AppUpdateFeature[] | Promise<readonly AppUpdateFeature[]>);

export type AppUpdateStackPosition = AppUpdateAlertPosition | "inline";

export interface AppUpdateStackApi {
  /** The cards being shown; empty for a release with no message. */
  features: readonly AppUpdateFeature[];
  /** Reload to pick up the new build (or your `onRefresh`). */
  refresh: () => void;
  /** Hide the notice until the next page load. */
  dismiss: () => void;
}

export interface AppUpdateStackProps extends UseAppUpdateOptions {
  /**
   * The update message: its cards, or a loader called ONCE, when an update is
   * detected (fetch the release notes for the build that just landed). Optional
   * -- a hotfix with no message still gets the plain refresh notice, as does a
   * loader that returns nothing or fails.
   */
  features?: AppUpdateFeatures;
  /** The plain notice's heading. Default `"Update available"`. */
  title?: ReactNode;
  /** The plain notice's body. Default `"A new version is ready."`. */
  description?: ReactNode;
  /** The refresh button. Default `"Refresh to get the latest"`. */
  refreshLabel?: ReactNode;
  /** The close button's accessible name. Default `"Close"`. */
  closeLabel?: string;
  /** react-fancy colour of the refresh button. Default `"violet"`. */
  color?: ButtonColor;
  /** A screen position, or `"inline"` to render where it is placed. Default `"bottom-right"`. */
  position?: AppUpdateStackPosition;
  /** Merged over the position's preset -- place the notice anywhere. */
  style?: CSSProperties;
  /** Classes on the notice. */
  className?: string;
  /** Classes on each card. */
  cardClassName?: string;
  /** How many cards show behind the front one. Default 2. */
  depth?: number;
  /** How far each card behind peeks out, in px. Default 8. */
  offset?: number;
  /** The stack's accessible name. Default `"Update"`. */
  label?: string;
  /** Customize the refresh action (default: hard `window.location.reload()`). */
  onRefresh?: () => void;
  /** Called when the person closes the notice. */
  onDismiss?: () => void;
  /** Replace a feature card's content. The close and refresh controls stay. */
  renderFeature?: (feature: AppUpdateFeature, state: { index: number; count: number; isFront: boolean }) => ReactNode;
  /** Replace the whole notice. Only rendered when an update is available. */
  render?: (api: AppUpdateStackApi) => ReactNode;
}

/** The card's own padding, so a header image can run edge to edge. */
const PAD = 16;

/**
 * Drop-in "a new version is available" notice that can say what is new.
 *
 * ```tsx
 * <AppUpdateStack />                                            // plain notice
 * <AppUpdateStack features={[{ title: "Dark mode", image: "/whats-new/dark.png" }]} />
 * <AppUpdateStack features={() => fetch("/whats-new").then((r) => r.json())} position="top" />
 * ```
 */
export function AppUpdateStack({
  features,
  title = "Update available",
  description = "A new version is ready.",
  refreshLabel = "Refresh to get the latest",
  closeLabel = "Close",
  color = "violet",
  position = "bottom-right",
  style,
  className,
  cardClassName,
  depth,
  offset,
  label = "Update",
  onRefresh,
  onDismiss,
  renderFeature,
  render,
  ...hookOptions
}: AppUpdateStackProps) {
  const { updateAvailable, refresh, dismiss } = useAppUpdate(hookOptions);
  const [loaded, setLoaded] = useState<readonly AppUpdateFeature[]>([]);

  // A loader runs once, when the update is detected -- not on every page load
  // that never sees one.
  const loader = typeof features === "function" ? features : null;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!updateAvailable || loadedOnce.current || !loaderRef.current) return;
    loadedOnce.current = true;
    let alive = true;
    Promise.resolve()
      .then(() => loaderRef.current!())
      .then(
        (list) => {
          if (alive && Array.isArray(list)) setLoaded(list);
        },
        () => {
          // No message is a valid release; the plain notice still offers the refresh.
        },
      );
    return () => {
      alive = false;
    };
  }, [updateAvailable]);

  if (!updateAvailable || typeof document === "undefined") return null;

  const list: readonly AppUpdateFeature[] = loader ? loaded : ((features as readonly AppUpdateFeature[] | undefined) ?? []);
  const doRefresh = onRefresh ?? refresh;
  const close = () => {
    dismiss();
    onDismiss?.();
  };

  if (render) return <>{render({ features: list, refresh: doRefresh, dismiss: close })}</>;

  const plain = list.length === 0;
  const items: AppUpdateFeature[] = plain ? [{ id: "update", title, description }] : [...list];
  const count = items.length;

  const content = (feature: AppUpdateFeature, index: number, isFront: boolean) => {
    const custom = !plain && renderFeature ? renderFeature(feature, { index, count, isFront }) : null;
    return (
      <div data-fancy-app-update-card="">
        {!custom && feature.image ? (
          <img
            data-fancy-app-update-image=""
            src={feature.image}
            alt={feature.imageAlt ?? ""}
            style={{ display: "block", width: "100%", height: "auto", maxHeight: 180, objectFit: "cover" }}
          />
        ) : null}
        <div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.4 }}>
              {custom ?? (
                <>
                  <div style={{ fontWeight: 600 }}>{feature.title}</div>
                  {feature.description ? <div style={{ marginTop: 2, opacity: 0.75 }}>{feature.description}</div> : null}
                </>
              )}
            </div>
            <Button variant="ghost" size="xs" icon="x" aria-label={closeLabel} title={closeLabel} onClick={close} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {count > 1 ? (
              <span data-fancy-app-update-count="" style={{ fontSize: 12, opacity: 0.6 }}>{`${index + 1} of ${count}`}</span>
            ) : null}
            <Button size="sm" color={color} onClick={doRefresh} style={{ marginLeft: "auto" }}>
              {refreshLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const stack = (
    <Toast.Stack
      items={items}
      getKey={(f, i) => f.id ?? String(i)}
      renderItem={(f, { index, isFront }) => content(f, index, isFront)}
      position="inline"
      label={label}
      depth={depth}
      offset={offset}
      cardClassName={["p-0 overflow-hidden", cardClassName].filter(Boolean).join(" ")}
      className={className}
    />
  );

  if (position === "inline") {
    return (
      <div data-fancy-app-update-stack="" data-position="inline" style={style}>
        {stack}
      </div>
    );
  }

  return (
    <Portal>
      <div
        data-fancy-app-update-stack=""
        data-position={position}
        style={{ position: "fixed", zIndex: 2147483000, maxWidth: "min(92vw, 24rem)", ...POSITION[position], ...style }}
      >
        {stack}
      </div>
    </Portal>
  );
}

AppUpdateStack.displayName = "AppUpdateStack";
