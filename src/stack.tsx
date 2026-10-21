/**
 * @particle-academy/fancy-app-update/stack
 *
 * The stacked variant of the refresh prompt: when a new build lands, the
 * release's feature cards stack behind each other (react-fancy's `Toast.Stack`
 * -- Previous / Next buttons, the wheel or the arrow keys walk through them),
 * each with a close button and a "Refresh to get the latest" action.
 *
 * A separate entry because it is built from react-fancy, an OPTIONAL peer: the
 * package root stays dependency-free for apps that only want the detector.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  /**
   * Shown instead of `image` in dark mode -- the `.dark` class on an ancestor,
   * the kit's convention. CSS-only, so it is right on the first paint and
   * follows a live theme toggle. With no `image`, the card has a header in dark
   * mode only.
   */
  imageDark?: string;
  /** Alt text for the header, whichever image is showing. */
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
  /** The button back to the previous feature card. Default `"Previous"`. Shown only with two or more cards. */
  previousLabel?: string;
  /** The button on to the next feature card. Default `"Next"`. Shown only with two or more cards. */
  nextLabel?: string;
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
  /** Replace a feature card's content. The close, refresh and Previous / Next controls stay. */
  renderFeature?: (feature: AppUpdateFeature, state: { index: number; count: number; isFront: boolean }) => ReactNode;
  /** Replace the whole notice. Only rendered when an update is available. */
  render?: (api: AppUpdateStackApi) => ReactNode;
}

/** Names each card control, so focus can follow it onto the next front card. */
const CONTROL = "data-fancy-app-update-control";
const FRONT_CARD = '[data-react-fancy-toast-stack-card="front"]';

/** The card's own padding, so a header image can run edge to edge. */
const PAD = 16;

/** The header image's box. No `display` here: on a themed pair the stylesheet owns it. */
const IMAGE_STYLE: CSSProperties = { width: "100%", height: "auto", maxHeight: 180, objectFit: "cover" };

/*
 * The per-theme header swap, keyed off the kit's `.dark` class on an ancestor.
 * A stylesheet rather than Tailwind's `dark:hidden` / `dark:block`, because a
 * consumer's Tailwind scans react-fancy's dist and not this package's, and
 * those two classes are not in react-fancy -- the dark variants would never be
 * generated and the dark image would never show. Plain CSS needs nothing from
 * the consumer's build. Rendered only when some card has an `imageDark`.
 */
const THEME_IMAGE_CSS =
  '[data-fancy-app-update-image="light"]{display:block}' +
  '[data-fancy-app-update-image="dark"]{display:none}' +
  '.dark [data-fancy-app-update-image="light"]{display:none}' +
  '.dark [data-fancy-app-update-image="dark"]{display:block}';

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
  previousLabel = "Previous",
  nextLabel = "Next",
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

  /*
   * Which card is in front is OURS, handed to Toast.Stack, so the Previous /
   * Next buttons, the wheel and the arrow keys all move one index. Toast.Stack
   * wraps that index for display; `current` below is the same wrap.
   */
  const [rawFront, setRawFront] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  /** The control that held focus when the front card changed, to restore on the new one. */
  const refocus = useRef<string | null>(null);

  const moveTo = (index: number) => {
    // Read focus NOW, while the event runs: once the card goes behind it is
    // inert, and the browser drops its focus to <body> (or the card unmounts,
    // with four or more features).
    const root = rootRef.current;
    const active = document.activeElement;
    if (root && active instanceof HTMLElement && root.contains(active) && active.closest(FRONT_CARD)) {
      refocus.current = active.getAttribute(CONTROL) ?? "";
    }
    setRawFront(index);
  };

  useLayoutEffect(() => {
    const want = refocus.current;
    if (want === null) return;
    refocus.current = null;
    const root = rootRef.current;
    if (!root) return;
    const card = root.querySelector(FRONT_CARD);
    const pick = (name: string) => card?.querySelector<HTMLButtonElement>(`[${CONTROL}="${name}"]`) ?? null;
    let target = want ? pick(want) : null;
    // At an end the button just pressed is disabled and cannot hold focus; its
    // partner is the one that still goes somewhere.
    if (target?.disabled) target = pick(want === "next" ? "previous" : "next");
    (target ?? root.querySelector<HTMLElement>("[data-react-fancy-toast-stack]"))?.focus();
  }, [rawFront]);

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
  const current = count === 0 ? 0 : ((rawFront % count) + count) % count;

  const content = (feature: AppUpdateFeature, index: number, isFront: boolean) => {
    const custom = !plain && renderFeature ? renderFeature(feature, { index, count, isFront }) : null;
    return (
      <div data-fancy-app-update-card="">
        {!custom && feature.imageDark ? (
          <>
            {feature.image ? (
              <img data-fancy-app-update-image="light" src={feature.image} alt={feature.imageAlt ?? ""} style={IMAGE_STYLE} />
            ) : null}
            <img data-fancy-app-update-image="dark" src={feature.imageDark} alt={feature.imageAlt ?? ""} style={IMAGE_STYLE} />
          </>
        ) : !custom && feature.image ? (
          <img
            data-fancy-app-update-image=""
            src={feature.image}
            alt={feature.imageAlt ?? ""}
            style={{ display: "block", ...IMAGE_STYLE }}
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
            <Button
              variant="ghost"
              size="xs"
              icon="x"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={close}
              {...{ [CONTROL]: "close" }}
            />
          </div>
          {count > 1 ? (
            // Walking the cards by button as well as by wheel and arrow keys
            // (fancy-app-update#2): scroll-to-advance is not discoverable. They
            // stop at the ends, so "1 of 3" has nowhere to go back to.
            <div data-fancy-app-update-nav="" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                variant="ghost"
                size="xs"
                icon="chevron-left"
                disabled={index === 0}
                onClick={() => moveTo(index - 1)}
                {...{ [CONTROL]: "previous" }}
              >
                {previousLabel}
              </Button>
              <span
                data-fancy-app-update-count=""
                style={{ flex: 1, textAlign: "center", fontSize: 12, opacity: 0.6 }}
              >{`${index + 1} of ${count}`}</span>
              <Button
                variant="ghost"
                size="xs"
                iconTrailing="chevron-right"
                disabled={index === count - 1}
                onClick={() => moveTo(index + 1)}
                {...{ [CONTROL]: "next" }}
              >
                {nextLabel}
              </Button>
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button size="sm" color={color} onClick={doRefresh} style={{ marginLeft: "auto" }} {...{ [CONTROL]: "refresh" }}>
              {refreshLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const themed = items.some((f) => f.imageDark);

  const stack = (
    <>
    {themed ? <style data-fancy-app-update-theme-images="">{THEME_IMAGE_CSS}</style> : null}
    <Toast.Stack
      items={items}
      getKey={(f, i) => f.id ?? String(i)}
      renderItem={(f, { index, isFront }) => content(f, index, isFront)}
      frontIndex={current}
      onFrontIndexChange={(i) => {
        if (i !== current) moveTo(i);
      }}
      position="inline"
      label={label}
      depth={depth}
      offset={offset}
      cardClassName={["p-0 overflow-hidden", cardClassName].filter(Boolean).join(" ")}
      className={className}
    />
    </>
  );

  if (position === "inline") {
    return (
      <div ref={rootRef} data-fancy-app-update-stack="" data-position="inline" style={style}>
        {stack}
      </div>
    );
  }

  return (
    <Portal>
      <div
        ref={rootRef}
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
