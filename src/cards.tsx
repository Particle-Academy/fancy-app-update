/**
 * @particle-academy/fancy-app-update/cards
 *
 * The feature-card presenter on its own: cards stacked on react-fancy's
 * `Toast.Stack`, quiet lowercase prev / next links, the fading scroll hint,
 * a per-theme header image, and stable data-* handles. No detector, no loader,
 * no idea why it is showing -- the caller decides that and says what the
 * card's action does.
 *
 * `AppUpdateStack` is built on it, and so is `@particle-academy/fancy-whats-new`.
 * It lives here because the refresh notice is itself one of these cards, and a
 * package for a single shared card would be a dependency every consumer pays
 * for and nobody asked for.
 *
 * A separate entry because it is built from react-fancy, an OPTIONAL peer: the
 * package root stays dependency-free.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button, Portal, Toast, type ButtonColor } from "@particle-academy/react-fancy";
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

/** A feature as one card of the stack. */
export interface FeatureCard extends AppUpdateFeature {
  /** A small line above the title -- fancy-whats-new puts the release's version here. */
  eyebrow?: ReactNode;
  /** Extra `data-*` attributes on the card's content root. */
  attributes?: Record<`data-${string}`, string>;
}

/** The card's one action button, beside close. */
export interface FeatureCardsAction {
  label: ReactNode;
  onClick: () => void;
  /** Its `data-<namespace>-control` value, e.g. `"refresh"` or `"dismiss"`. */
  control: string;
}

export type FeatureCardsPosition = AppUpdateAlertPosition | "inline";

export interface FeatureCardsProps {
  /** The cards, front first. None renders nothing. */
  cards: readonly FeatureCard[];
  /** Called by the close button on every card. */
  onClose: () => void;
  /** The action button on every card. Omit for close only. */
  action?: FeatureCardsAction;
  /**
   * The prefix of every handle, stylesheet and keyframe: `data-<namespace>-card`,
   * `data-<namespace>-control`, ... Default `"fancy-app-update"`.
   */
  namespace?: string;
  /** Change it to go back to the first card (a new set of cards). */
  resetKey?: unknown;
  /** The close button's accessible name. Default `"Close"`. */
  closeLabel?: string;
  /** The link back to the previous card. Default `"prev"`. Shown only with two or more cards. */
  previousLabel?: string;
  /** The link on to the next card. Default `"next"`. Shown only with two or more cards. */
  nextLabel?: string;
  /**
   * A faint hint, over the front card, that the stack scrolls: it fades in when
   * a mouse pointer enters a stack of two or more cards and fades out on its
   * own. `false` turns it off; a string replaces its words. Default `"scroll"`.
   */
  scrollHint?: boolean | string;
  /** react-fancy colour of the action button. Default `"violet"`. */
  color?: ButtonColor;
  /** A screen position, or `"inline"` to render where it is placed. Default `"bottom-right"`. */
  position?: FeatureCardsPosition;
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
  /** Extra `data-*` attributes on the notice's root. */
  attributes?: Record<`data-${string}`, string>;
  /** Replace a card's title and description. The eyebrow, close, action and prev / next stay. */
  renderFeature?: (feature: FeatureCard, state: { index: number; count: number; isFront: boolean }) => ReactNode;
}

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
export function themeImageCss(ns: string): string {
  return (
    `[data-${ns}-image="light"]{display:block}` +
    `[data-${ns}-image="dark"]{display:none}` +
    `.dark [data-${ns}-image="light"]{display:none}` +
    `.dark [data-${ns}-image="dark"]{display:block}`
  );
}

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
export function stackCss(ns: string): string {
  return (
    `[data-${ns}-link]:not(:disabled):hover,` +
    `[data-${ns}-link]:not(:disabled):focus-visible` +
    "{text-decoration:underline;text-underline-offset:2px}" +
    // Button's focus ring is a box-shadow; on a padding-less link it hugs the
    // text. Off for pointer focus (focus follows the control after a click), kept
    // for the keyboard, where it is the focus indicator.
    `[data-${ns}-link]:focus:not(:focus-visible){box-shadow:none}` +
    `@keyframes ${ns}-scroll-hint{0%{opacity:0}15%{opacity:1}70%{opacity:1}100%{opacity:0}}` +
    `@keyframes ${ns}-scroll-hint-still{0%{opacity:1}100%{opacity:0}}` +
    `[data-${ns}-scroll-hint]{opacity:0}` +
    `[data-${ns}-scroll-hint="show"]{animation:${ns}-scroll-hint 2.4s ease-in-out forwards}` +
    "@media (prefers-reduced-motion: reduce){" +
    `[data-${ns}-scroll-hint="show"]{animation:${ns}-scroll-hint-still 1.6s steps(1,end) forwards}` +
    "}"
  );
}

/** prev / next: link-sized, no button chrome. Ghost Buttons, so focus ring and disabled state come from react-fancy. */
export const LINK_STYLE: CSSProperties = {
  padding: 0,
  height: "auto",
  minHeight: 0,
  background: "transparent",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.4,
};

const EYEBROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 2,
  fontSize: 11,
  lineHeight: 1.4,
  letterSpacing: "0.02em",
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
 * Stacked feature cards, each with close, an optional action, and prev / next.
 *
 * ```tsx
 * <FeatureCards
 *   cards={[{ title: "Dark mode", eyebrow: "v1.4.0", image: "/whats-new/dark.png" }]}
 *   action={{ label: "got it", onClick: close, control: "dismiss" }}
 *   onClose={close}
 * />
 * ```
 */
export function FeatureCards({
  cards,
  onClose,
  action,
  namespace = "fancy-app-update",
  resetKey,
  closeLabel = "Close",
  previousLabel = "prev",
  nextLabel = "next",
  scrollHint = true,
  color = "violet",
  position = "bottom-right",
  style,
  className,
  cardClassName,
  depth,
  offset,
  label = "Update",
  attributes,
  renderFeature,
}: FeatureCardsProps) {
  const ns = namespace;
  /** Names each card control, so focus can follow it onto the next front card. */
  const CONTROL = `data-${ns}-control`;

  /*
   * Which card is in front is OURS, handed to Toast.Stack, so prev / next, the
   * wheel and the arrow keys all move one index. Toast.Stack wraps that index
   * for display; `current` below is the same wrap.
   */
  const [rawFront, setRawFront] = useState(0);
  /** Bumped on each pointer entry, to replay the scroll hint; 0 is hidden. */
  const [hintRun, setHintRun] = useState(0);
  const [lastReset, setLastReset] = useState(resetKey);

  // Adjusted during render (React's pattern for state derived from a prop
  // change), so the first paint after a change is already right.
  if (!Object.is(resetKey, lastReset)) {
    setLastReset(resetKey);
    setRawFront(0);
    setHintRun(0);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  /** The control that held focus when the front card changed, to restore on the new one. */
  const refocus = useRef<string | null>(null);

  const moveTo = (index: number) => {
    // Read focus NOW, while the event runs: once the card goes behind it is
    // inert, and the browser drops its focus to <body> (or the card unmounts,
    // with four or more cards).
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
  }, [rawFront, CONTROL]);

  if (cards.length === 0 || typeof document === "undefined") return null;

  const count = cards.length;
  const current = ((rawFront % count) + count) % count;

  const hintText = typeof scrollHint === "string" ? scrollHint : "scroll";
  const hinting = scrollHint !== false && count > 1 && hintRun > 0;
  // The wheel is a mouse affordance: a finger entering the stack gets no hint.
  const showHint = (e: ReactPointerEvent) => {
    if (scrollHint === false || count < 2 || e.pointerType === "touch") return;
    setHintRun((n) => n + 1);
  };

  const content = (card: FeatureCard, index: number, isFront: boolean) => {
    const custom = renderFeature ? renderFeature(card, { index, count, isFront }) : null;
    return (
      <div {...{ [`data-${ns}-card`]: "" }} {...card.attributes}>
        {isFront && hinting ? (
          // Remounted per pointer entry (the key), which replays the fade.
          <div key={`hint-${hintRun}`} {...{ [`data-${ns}-scroll-hint`]: "show" }} aria-hidden="true" style={HINT_STYLE}>
            <WheelGlyph />
            <span>{hintText}</span>
          </div>
        ) : null}
        {!custom && card.imageDark ? (
          <>
            {card.image ? (
              <img {...{ [`data-${ns}-image`]: "light" }} src={card.image} alt={card.imageAlt ?? ""} style={IMAGE_STYLE} />
            ) : null}
            <img {...{ [`data-${ns}-image`]: "dark" }} src={card.imageDark} alt={card.imageAlt ?? ""} style={IMAGE_STYLE} />
          </>
        ) : !custom && card.image ? (
          <img
            {...{ [`data-${ns}-image`]: "" }}
            src={card.image}
            alt={card.imageAlt ?? ""}
            style={{ display: "block", ...IMAGE_STYLE }}
          />
        ) : null}
        <div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.4 }}>
              {card.eyebrow != null ? (
                <div {...{ [`data-${ns}-eyebrow`]: "" }} style={EYEBROW_STYLE}>
                  {card.eyebrow}
                </div>
              ) : null}
              {custom ?? (
                <>
                  <div style={{ fontWeight: 600 }}>{card.title}</div>
                  {card.description ? <div style={{ marginTop: 2, opacity: 0.75 }}>{card.description}</div> : null}
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
              onClick={onClose}
              {...{ [CONTROL]: "close" }}
            />
          </div>
          {count > 1 ? (
            // Walking the cards by link as well as by wheel and arrow keys
            // (fancy-app-update#2): scroll-to-advance is not discoverable. They
            // stop at the ends, so "1 of 3" has nowhere to go back to. Quiet
            // lowercase links by the owner's direction, but real <button>s.
            <div {...{ [`data-${ns}-nav`]: "" }} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={index === 0}
                onClick={() => moveTo(index - 1)}
                style={LINK_STYLE}
                {...{ [`data-${ns}-link`]: "", [CONTROL]: "previous" }}
              >
                {previousLabel}
              </Button>
              <span {...{ [`data-${ns}-count`]: "" }} style={{ fontSize: 12, opacity: 0.6 }}>{`${index + 1} of ${count}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={index === count - 1}
                onClick={() => moveTo(index + 1)}
                style={LINK_STYLE}
                {...{ [`data-${ns}-link`]: "", [CONTROL]: "next" }}
              >
                {nextLabel}
              </Button>
            </div>
          ) : null}
          {action ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                type="button"
                size="sm"
                color={color}
                onClick={action.onClick}
                style={{ marginLeft: "auto" }}
                {...{ [CONTROL]: action.control }}
              >
                {action.label}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const themed = cards.some((f) => f.imageDark);

  const stack = (
    <>
      <style {...{ [`data-${ns}-css`]: "" }}>{stackCss(ns)}</style>
      {themed ? <style {...{ [`data-${ns}-theme-images`]: "" }}>{themeImageCss(ns)}</style> : null}
      <Toast.Stack
        items={cards}
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

  const rootAttrs = { [`data-${ns}-stack`]: "", ...attributes };

  if (position === "inline") {
    return (
      <div ref={rootRef} {...rootAttrs} data-position="inline" style={style} onPointerEnter={showHint}>
        {stack}
      </div>
    );
  }

  return (
    <Portal>
      <div
        ref={rootRef}
        {...rootAttrs}
        data-position={position}
        onPointerEnter={showHint}
        style={{ position: "fixed", zIndex: 2147483000, maxWidth: "min(92vw, 24rem)", ...POSITION[position], ...style }}
      >
        {stack}
      </div>
    </Portal>
  );
}

FeatureCards.displayName = "FeatureCards";
