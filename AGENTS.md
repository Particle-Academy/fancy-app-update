# AGENTS.md — fancy-app-update

"A new version is available — refresh" for any React app. `CLAUDE.md` symlinks
here. This file describes **this package's code**; process rules live in the
envelope's `RULES.md`.

## Layout

- `src/useAppUpdate.ts` — the detector: a custom `check`, a version compare, or
  the page's ETag / Last-Modified. Polls on an interval and on focus; stops once
  an update is seen or dismissed.
- `src/AppUpdateAlert.tsx` — the self-contained prompt. Inline styles, no UI
  library.
- `src/stack.tsx` — `AppUpdateStack`, the `./stack` entry (DEPRECATED since
  0.7.0, never removed: MOIC uses it): the detector + loader + on-demand state,
  rendering `FeatureCards`, with a plain notice when there are none.
- `src/cards.tsx` — `FeatureCards`, the `./cards` entry: the card presenter
  alone (Toast.Stack, prev / next, scroll hint, `imageDark`, handles), no
  detector. **`@particle-academy/fancy-whats-new` imports it**, so a change here
  is a change to that package's notice too — run its suite against a local
  build before shipping one.
- `src/position.ts` — the fixed positions both prompts share.

## Invariants

- **The package root imports nothing but React.** react-fancy is an OPTIONAL
  peer reached only from `./stack` and `./cards`; it is external in `tsup.config.ts`. Check
  `dist/index.js` for `react-fancy` after a build — it must be absent.
- **A network failure is never an update.** Every detector path returns `false`
  on error. A false positive asks people to reload for nothing, and they learn
  to ignore the prompt.
- **An update message is optional.** `AppUpdateStack` with no features, or a
  loader that returns nothing or throws, still shows the refresh notice — a
  hotfix has no notes and still needs the reload.
- **The feature loader runs once, the first time the notice shows** — an update
  is detected, or `open` asks for it — never on a page load that sees none and
  is never opened.
- **No update pending means no refresh action.** Opened on demand (`open`) with
  nothing detected, the cards offer `dismissLabel` instead; with an update also
  pending they keep the refresh. Close closes both, or it would appear inert.
- **Every handle, stylesheet rule and keyframe in `cards.tsx` is built from
  `namespace`** (default `fancy-app-update`). Never write a literal
  `data-fancy-app-update-*` there: it would match nothing inside a What's New
  notice. `AppUpdateStack` passes no namespace, which is what keeps its DOM
  identical to 0.6.0.
- **The scroll hint and the prev / next link look live in `stackCss(ns)`**, a
  `<style>` the notice renders, for the same reason as `imageDark`: the hint's
  fade is a keyframe animation keyed off `data-<ns>-scroll-hint`,
  the links' underline and pointer-focus ring are attribute selectors. jsdom
  runs no animations; verify the fade in a browser, freezing it with the Web
  Animations API (`el.getAnimations()[0]`, `pause()`, set `currentTime`) for a
  mid-fade frame.
- **Button has `transition-all`**: read a computed colour or box-shadow 200ms or
  more after the change, or you read the start of the transition.
- **A card's image is a full-width header**, so the card's own padding is zeroed
  (`p-0 overflow-hidden` merged into `cardClassName`) and the body pads itself.
  Those two classes are ones react-fancy's dist already contains, so a consumer
  scanning react-fancy generates them.
- **Any class this package uses must already be in react-fancy's dist**, because
  that is the only dist a consumer's Tailwind scans. `imageDark`'s light/dark
  swap is NOT Tailwind for that reason: `dark:hidden` / `dark:block` are not in
  react-fancy (checked 2026-10-20), so it is a small `<style>` keyed off `.dark`
  (`themeImageCss(ns)` in `src/cards.tsx`). The themed images carry no inline
  `display`, which would beat the stylesheet.
- **jsdom does not invalidate computed styles on an attribute change**, only on
  child-list / text / stylesheet changes. Set `.dark` BEFORE rendering in a
  test; a mid-test toggle reads a stale `display`.

## Checking a change

`npm test` (vitest + jsdom). The hook checks on an interval, not on mount, so
tests pass a short `interval` with `check: () => true`. jsdom does not lay out:
look at the stack in a real browser, with Tailwind built from react-fancy's
`dist` the way a consumer's is.
