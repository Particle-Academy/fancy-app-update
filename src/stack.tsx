/**
 * @particle-academy/fancy-app-update/stack
 *
 * The stacked variant of the refresh prompt: when a new build lands, the
 * release's feature cards stack behind each other (react-fancy's `Toast.Stack`
 * -- prev / next links, the wheel or the arrow keys walk through them), each
 * with a close button and a "Refresh to get the latest" action.
 *
 * DEPRECATED as a feature notice, since 0.7.0: feature cards on a refresh notice
 * describe features the open page does not have yet. "What's new since you were
 * last here" is `@particle-academy/fancy-whats-new`, shown on the first load
 * AFTER the refresh. This entry keeps working, unchanged.
 *
 * The cards themselves are `FeatureCards` (`./cards`), shared with
 * fancy-whats-new. A separate entry because it is built from react-fancy, an
 * OPTIONAL peer: the package root stays dependency-free for apps that only want
 * the detector.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ButtonColor } from "@particle-academy/react-fancy";
import { useAppUpdate, type UseAppUpdateOptions } from "./useAppUpdate";
import { FeatureCards, type AppUpdateFeature, type FeatureCardsPosition } from "./cards";

export type { AppUpdateFeature } from "./cards";

export type AppUpdateFeatures =
  | readonly AppUpdateFeature[]
  | (() => readonly AppUpdateFeature[] | Promise<readonly AppUpdateFeature[]>);

export type AppUpdateStackPosition = FeatureCardsPosition;

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

/**
 * Drop-in "a new version is available" notice that can say what is new.
 *
 * ```tsx
 * <AppUpdateStack />                                            // plain notice
 * <AppUpdateStack features={[{ title: "Dark mode", image: "/whats-new/dark.png" }]} />
 * ```
 *
 * @deprecated since 0.7.0. Feature cards on a refresh notice describe features
 * the open page does not have yet, and remember nothing about what a person has
 * already seen. Show them on the first load AFTER the refresh with `<WhatsNew>`
 * from `@particle-academy/fancy-whats-new` (built on the same cards,
 * `FeatureCards` from `@particle-academy/fancy-app-update/cards`), and keep
 * this package to its one job, the plain refresh notice: `<AppUpdateAlert>`.
 * Nothing is removed: every prop still works and nothing changes on upgrade.
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

  // Adjusted during render (React's pattern for state derived from a prop
  // change), so the first paint after a change is already right.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setShut(false);
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

  // Hidden, the cards unmount -- so each opening starts at the first card with
  // no hint showing.
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
  const cards: AppUpdateFeature[] = plain ? [{ id: "update", title, description }] : [...list];

  return (
    <FeatureCards
      cards={cards}
      onClose={close}
      action={
        updateAvailable
          ? { label: refreshLabel, onClick: doRefresh, control: "refresh" }
          : // Opened on demand with no new build: nothing to reload.
            { label: dismissLabel, onClick: close, control: "dismiss" }
      }
      closeLabel={closeLabel}
      previousLabel={previousLabel}
      nextLabel={nextLabel}
      scrollHint={scrollHint}
      color={color}
      position={position}
      style={style}
      className={className}
      cardClassName={cardClassName}
      depth={depth}
      offset={offset}
      label={label}
      renderFeature={plain ? undefined : renderFeature}
    />
  );
}

AppUpdateStack.displayName = "AppUpdateStack";
