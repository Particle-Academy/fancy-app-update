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
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
  /** Hide the notice until the next page load, and close an on-demand view. */
  dismiss: () => void;
  /**
   * Whether a new build was detected. False when the notice is showing only
   * because `open` asked for it (a "What's New" view): there is nothing to reload.
   */
  updateAvailable: boolean;
}

export interface AppUpdateStackProps extends UseAppUpdateOptions {
  /**
   * The update message: its cards, or a loader called ONCE, the first time the
   * notice is shown -- when an update is detected, or when `open` asks for it
   * (fetch the release notes for the build that just landed). Optional -- a
   * hotfix with no message still gets the plain refresh notice, as does a
   * loader that returns nothing or fails.
   */
  features?: AppUpdateFeatures;
  /**
   * Show the notice on demand, whether or not an update was detected -- a
   * "What's New" item in a menu that re-opens the latest cards. With no update
   * pending there is nothing to reload, so the cards offer `dismissLabel`
   * instead of the refresh action; with one pending they keep the refresh.
   * Opened with no cards, it shows nothing. Leave it unset and the notice shows
   * only on a detected update, as before.
   */
  open?: boolean;
  /**
   * Called with `false` when the person closes a notice that `open` is showing
   * (the close button, or `dismissLabel`). Set your `open` state from it.
   */
  onOpenChange?: (open: boolean) => void;
  /** The action that closes an on-demand view with no update pending. Default `"got it"`. */
  dismissLabel?: ReactNode;
  /**
   * A faint hint, over the front card, that the stack scrolls: it fades in when
   * a mouse pointer enters a stack of two or more cards and fades out on its
   * own. `false` turns it off; a string replaces its words. Default `"scroll"`.
   */
  scrollHint?: boolean | string;
  /** The plain notice's heading. Default `"Update available"`. */
  title?: ReactNode;
  /** The plain notice's body. Default `"A new version is ready."`. */
  description?: ReactNode;
  /** The refresh button. Default `"Refresh to get the latest"`. */
  refreshLabel?: ReactNode;
  /** The close button's accessible name. Default `"Close"`. */
  closeLabel?: string;
  /** The link back to the previous feature card. Default `"prev"`. Shown only with two or more cards. */
  previousLabel?: string;
  /** The link on to the next feature card. Default `"next"`. Shown only with two or more cards. */
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
  /** Replace a feature card's content. The close, refresh / dismiss and prev / next controls stay. */
  renderFeature?: (feature: AppUpdateFeature, state: { index: number; count: number; isFront: boolean }) => ReactNode;
  /** Replace the whole notice. Only rendered when an update is available or `open` asks for it. */
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

/*
 * The notice's own stylesheet, for the same reason as the image swap: nothing
 * here may depend on a class react-fancy's dist does not contain.
 *
 * - prev / next read as quiet links: an underline on hover or keyboard focus,
 *   never on a disabled one, and no focus ring after a click. Their box is
 *   inline style.
 * - The scroll hint fades in, holds, and fades out, once per pointer entry --
 *   the element is remounted to replay it. Under prefers-reduced-motion it does
 *   not fade: `steps(1, end)` holds the first frame, shown, for the run and then
 *   cuts to hidden, so it is shown briefly without moving.
 */
const STACK_CSS =
  "[data-fancy-app-update-link]:not(:disabled):hover," +
  "[data-fancy-app-update-link]:not(:disabled):focus-visible" +
  "{text-decoration:underline;text-underline-offset:2px}" +
  // Button's focus ring is a box-shadow; on a padding-less link it hugs the
  // text. Off for pointer focus (focus follows the control after a click), kept
  // for the keyboard, where it is the focus indicator.
  "[data-fancy-app-update-link]:focus:not(:focus-visible){box-shadow:none}" +
  "@keyframes fancy-app-update-scroll-hint{0%{opacity:0}15%{opacity:1}70%{opacity:1}100%{opacity:0}}" +
  "@keyframes fancy-app-update-scroll-hint-still{0%{opacity:1}100%{opacity:0}}" +
  "[data-fancy-app-update-scroll-hint]{opacity:0}" +
  '[data-fancy-app-update-scroll-hint="show"]{animation:fancy-app-update-scroll-hint 2.4s ease-in-out forwards}' +
  "@media (prefers-reduced-motion: reduce){" +
  '[data-fancy-app-update-scroll-hint="show"]{animation:fancy-app-update-scroll-hint-still 1.6s steps(1,end) forwards}' +
  "}";

/** prev / next: link-sized, no button chrome. Ghost Buttons, so focus ring and disabled state come from react-fancy. */
const LINK_STYLE: CSSProperties = {
  padding: 0,
  height: "auto",
  minHeight: 0,
  background: "transparent",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.4,
};

/**
 * The scroll hint: over the front card's upper part (the image header, when
 * there is one, rather than the title), out of flow, never in the way.
 */
const HINT_STYLE: CSSProperties = {
  position: "absolute",
  top: "30%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(24, 24, 27, 0.72)",
  color: "#fff",
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

/** A mouse with its wheel: inline SVG, so the hint needs no icon set loaded. */
function WheelGlyph() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="0.75" y="0.75" width="10.5" height="14.5" rx="5.25" />
      <line x1="6" y1="3.5" x2="6" y2="6.5" strokeLinecap="round" />
    </svg>
  );
}

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
  previousLabel = "prev",
  nextLabel = "next",
  dismissLabel = "got it",
  scrollHint = true,
  open,
  onOpenChange,
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

  /*
   * Shown on a detected update (as always), or on demand through `open`
   * (fancy-app-update#3). `shut` is the person closing an on-demand view: it
   * hides at once even if the caller does not wire `onOpenChange`, and clears
   * the next time `open` turns true.
   */
  const [shut, setShut] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  const visibleOnDemand = open === true && !shut;
  const visible = updateAvailable || visibleOnDemand;

  /*
   * Which card is in front is OURS, handed to Toast.Stack, so prev / next, the
   * wheel and the arrow keys all move one index. Toast.Stack wraps that index
   * for display; `current` below is the same wrap.
   */
  const [rawFront, setRawFront] = useState(0);
  /** Bumped on each pointer entry, to replay the scroll hint; 0 is hidden. */
  const [hintRun, setHintRun] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);

  // Adjusted during render (React's pattern for state derived from a prop
  // change), so the first paint after a change is already right.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setShut(false);
  }
  if (visible !== wasVisible) {
    setWasVisible(visible);
    // Each time it opens, it opens at the first card, with no hint showing.
    if (visible) {
      setRawFront(0);
      setHintRun(0);
    }
  }

  // A loader runs once, the first time the notice is shown -- not on every page
  // load that never sees an update and is never opened.
  const loader = typeof features === "function" ? features : null;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!visible || loadedOnce.current || !loaderRef.current) return;
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
  }, [visible]);

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
    // They have found how to move through the cards; the hint has done its job.
    setHintRun(0);
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

  if (!visible || typeof document === "undefined") return null;

  const list: readonly AppUpdateFeature[] = loader ? loaded : ((features as readonly AppUpdateFeature[] | undefined) ?? []);
  const doRefresh = onRefresh ?? refresh;
  /*
   * Closing closes everything that is showing: the update notice (until the
   * next page load, as before) AND an on-demand view. Closing only one would
   * leave the other on screen and the close button would seem to do nothing.
   */
  const close = () => {
    if (updateAvailable) {
      dismiss();
      onDismiss?.();
    }
    if (open) {
      setShut(true);
      onOpenChange?.(false);
    }
  };

  if (render) return <>{render({ features: list, refresh: doRefresh, dismiss: close, updateAvailable })}</>;

  // Opened on demand with no update pending and no cards: there is no news to
  // show, and the plain "Update available" card would be untrue.
  if (!updateAvailable && list.length === 0) return null;

  const plain = list.length === 0;
  const items: AppUpdateFeature[] = plain ? [{ id: "update", title, description }] : [...list];
  const count = items.length;
  const current = count === 0 ? 0 : ((rawFront % count) + count) % count;

  const hintText = typeof scrollHint === "string" ? scrollHint : "scroll";
  const hinting = scrollHint !== false && count > 1 && hintRun > 0;
  // The wheel is a mouse affordance: a finger entering the stack gets no hint.
  const showHint = (e: ReactPointerEvent) => {
    if (scrollHint === false || count < 2 || e.pointerType === "touch") return;
    setHintRun((n) => n + 1);
  };

  const content = (feature: AppUpdateFeature, index: number, isFront: boolean) => {
    const custom = !plain && renderFeature ? renderFeature(feature, { index, count, isFront }) : null;
    return (
      <div data-fancy-app-update-card="">
        {isFront && hinting ? (
          // Remounted per pointer entry (the key), which replays the fade.
          <div key={`hint-${hintRun}`} data-fancy-app-update-scroll-hint="show" aria-hidden="true" style={HINT_STYLE}>
            <WheelGlyph />
            <span>{hintText}</span>
          </div>
        ) : null}
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
              type="button"
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
            // Walking the cards by link as well as by wheel and arrow keys
            // (fancy-app-update#2): scroll-to-advance is not discoverable. They
            // stop at the ends, so "1 of 3" has nowhere to go back to. Quiet
            // lowercase links by the owner's direction, but real <button>s.
            <div data-fancy-app-update-nav="" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={index === 0}
                onClick={() => moveTo(index - 1)}
                style={LINK_STYLE}
                data-fancy-app-update-link=""
                {...{ [CONTROL]: "previous" }}
              >
                {previousLabel}
              </Button>
              <span data-fancy-app-update-count="" style={{ fontSize: 12, opacity: 0.6 }}>{`${index + 1} of ${count}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={index === count - 1}
                onClick={() => moveTo(index + 1)}
                style={LINK_STYLE}
                data-fancy-app-update-link=""
                {...{ [CONTROL]: "next" }}
              >
                {nextLabel}
              </Button>
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {updateAvailable ? (
              <Button
                type="button"
                size="sm"
                color={color}
                onClick={doRefresh}
                style={{ marginLeft: "auto" }}
                {...{ [CONTROL]: "refresh" }}
              >
                {refreshLabel}
              </Button>
            ) : (
              // Opened on demand with no new build: nothing to reload.
              <Button
                type="button"
                size="sm"
                color={color}
                onClick={close}
                style={{ marginLeft: "auto" }}
                {...{ [CONTROL]: "dismiss" }}
              >
                {dismissLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const themed = items.some((f) => f.imageDark);

  const stack = (
    <>
    <style data-fancy-app-update-css="">{STACK_CSS}</style>
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
      <div ref={rootRef} data-fancy-app-update-stack="" data-position="inline" style={style} onPointerEnter={showHint}>
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
        onPointerEnter={showHint}
        style={{ position: "fixed", zIndex: 2147483000, maxWidth: "min(92vw, 24rem)", ...POSITION[position], ...style }}
      >
        {stack}
      </div>
    </Portal>
  );
}

AppUpdateStack.displayName = "AppUpdateStack";
