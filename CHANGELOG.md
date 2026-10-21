# Changelog

Notable changes to `@particle-academy/fancy-app-update`.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

> Entries below **1.0** were reconstructed from git history when this file was
> introduced, so they summarise commit subjects rather than consumer impact.
> Everything from the next release onward is written by hand, in the same commit
> as the change.

---

## [Unreleased]

### Security

- **Dev toolchain only — no runtime change, nothing for consumers to do.** The
  lockfile now resolves `vite` 8.3.5 (was 8.2.2), whose bundled
  `launch-editor` fixes GHSA-587h-7wmj-h5pm (HIGH, `fs.existsSync()` check
  bypassable on Windows), GHSA-698v-4r3x-3vcv (`escapeCmdArgs()` omits `%`
  escaping on Windows) and GHSA-r825-w8mm-5pxw (editor CLI flag
  misinterpretation). `vite` is only reached through the test/dev toolchain
  and the published package does not ship our lockfile, so the exposure was
  this repo's own dev server.

## [0.7.0] - 2026-10-21

**Nothing to do on upgrade.** `AppUpdateStack` is deprecated, not changed: every
prop works as it did and its DOM, handles and defaults are identical (its whole
0.6.0 suite passes unmodified on the new internals).

### Added

- **`FeatureCards`, on the new `./cards` entry**: the feature-card presenter on
  its own (stacked cards on react-fancy's `Toast.Stack`, prev / next links, the
  scroll hint, `imageDark`, data-* handles), with no detector. It is what
  `AppUpdateStack` renders, and what `@particle-academy/fancy-whats-new` builds
  on, so the two notices share one card instead of two copies. New over the
  0.6.0 card: a `namespace` for the handles / stylesheet / keyframes (default
  `"fancy-app-update"`), a per-card `eyebrow` line above the title, per-card and
  root `attributes`, an optional `action`, and `resetKey`. Same optional
  react-fancy peer as `./stack` (`>=5.41.0`); the package root still imports
  nothing but React.

### Deprecated

- **`AppUpdateStack` (`./stack`), in favour of
  `@particle-academy/fancy-whats-new`.** Feature cards on a refresh notice
  describe features the open page does not have yet, cover only the build that
  landed mid-session, and remember nothing about what a person already saw.
  `<WhatsNew>` shows them on the first load after the refresh, for every release
  missed, once, on the same cards. This package goes back to its one job: detect
  a new build, show the plain refresh notice (`AppUpdateAlert`). Marked with
  JSDoc `@deprecated`, so editors strike it through; **nothing is removed**, and
  there is no date for removal.

## [0.6.0] - 2026-10-21

**BREAKING, for one hour's worth of consumers: the default prev / next words
are now lowercase `"prev"` / `"next"`** (0.5.0 said `"Previous"` / `"Next"`).
Only matters if you found the buttons by their text -- a test using
`getByRole("button", { name: "Next" })`, say. Pass `previousLabel="Previous"`
/ `nextLabel="Next"` to keep the old words, or find them by
`data-fancy-app-update-control="previous"` / `"next"`. Nothing else needs doing:
with `open` unset, the notice shows on a detected update exactly as before.

### Added

- **`open` / `onOpenChange`: open the notice on demand** (fancy-app-update#3),
  for a "What's New" item in a menu that re-opens the latest cards. `open`
  shows the stack whether or not an update was detected.
  - **With no update pending there is no refresh action** -- there is no new
    build to load. The cards offer **`dismissLabel`** instead (default
    `"got it"`).
  - **With an update pending as well, the refresh stays**, because there is a
    build to load.
  - **Closing closes everything showing**: it calls `onOpenChange(false)`, and
    with an update pending it also dismisses that (`onDismiss`). Closing only
    one would leave the other on screen and the close button would seem to do
    nothing. With `onOpenChange` not wired, closing still hides it until `open`
    turns true again.
  - Each opening starts at the first card. Opened with no cards it shows
    nothing (the plain "Update available" card would be untrue).
  - A `features` loader now runs the first time the notice shows -- on a
    detected update, as before, or on the first `open`.
  - `render` receives **`updateAvailable`**, so a custom notice can tell the
    two apart.
- **A scroll hint**: a faint "scroll" watermark fades in over the front card
  when a mouse pointer enters a stack of two or more cards, holds, and fades
  out on its own; it goes away once the person moves through the cards. It
  takes no clicks (`pointer-events: none`), moves no layout (absolutely
  positioned) and is `aria-hidden` (the links are the accessible way through).
  Under `prefers-reduced-motion` it does not fade: it shows briefly, then is
  gone. **`scrollHint`** takes a string for its words, or `false` to turn it
  off. Touch pointers get no hint; the wheel is a mouse affordance.
  - It is a keyframe animation in a `<style>` the notice renders (with the link
    rules below), not Tailwind, so it needs nothing from your build.

### Changed

- **prev / next are quiet, small lowercase links**, by the owner's direction:
  12px, no padding or fill, an underline on hover and on keyboard focus. They
  are still real `<button type="button">`s (react-fancy ghost `Button`s), so
  Tab reaches them and Enter / Space press them. Button's focus ring now shows
  for keyboard focus only, not after a click. They carry
  `data-fancy-app-update-link`. The chevron icons are gone.
- The count sits between the two links on the left of the card, rather than
  centred between buttons at either edge.
- Every card control is now `type="button"`, so a notice inside a `<form>`
  cannot submit it.

## [0.5.0] - 2026-10-21

**Nothing to do.** A notice with one card, or the plain hotfix notice, renders
exactly as before; scrolling and the arrow keys still walk the cards.

### Added

- **Previous / Next buttons on each feature card** (fancy-app-update#2).
  Scroll-to-advance is not discoverable, so with two or more cards each one
  now carries Previous and Next beside its "1 of 3". They are react-fancy
  `Button`s with chevrons.
  - **They stop at the ends**: Previous is disabled on the first card and Next
    on the last, so "1 of 3" never steps back to "3 of 3". The wheel and the
    arrow keys still wrap, as `Toast.Stack` does.
  - The buttons, the wheel and the arrow keys move the same card -- the stack's
    front index is now held by `AppUpdateStack` and handed to `Toast.Stack` --
    so an arrow key on a focused button steps once.
  - **Focus stays on the front card** when it changes. The card that held it
    goes behind (and inert), so focus moves to the same control on the new front
    card; at an end, where that button is now disabled, to its partner.
  - `previousLabel` / `nextLabel` change the words (defaults `"Previous"` /
    `"Next"`), like `refreshLabel` and `closeLabel`.
  - A `renderFeature` override keeps them, as it keeps close and refresh.
  - The card's controls carry `data-fancy-app-update-control` (`"previous"`,
    `"next"`, `"close"`, `"refresh"`); the button row is
    `data-fancy-app-update-nav`.

### Changed

- With two or more cards, the "N of M" count moves into the new button row,
  between Previous and Next, and the refresh button sits on its own row below.

## [0.4.0] - 2026-10-20

**Nothing to do.** A card with only `image` renders exactly as before.

### Added

- **`AppUpdateFeature.imageDark`: a per-theme header image** (fancy-app-update#1).
  It is shown instead of `image` in dark mode -- the `.dark` class on an
  ancestor, the kit's convention -- so a release can show a dark screenshot to
  someone in dark mode instead of a bright light-mode block in a dark card.
  `imageAlt` serves both. With no `image`, the card has a header in dark mode
  only.
  - The swap is a small stylesheet the notice renders (only when some card has
    an `imageDark`), keyed off `.dark`. It is CSS, so it is right on the first
    paint and follows a live theme toggle; and it is plain CSS rather than
    Tailwind's `dark:hidden` / `dark:block`, because your Tailwind scans
    react-fancy's dist and not this package's, and those classes are not in
    react-fancy -- the dark image would never have shown.
  - The two images carry `data-fancy-app-update-image="light"` / `"dark"`. A
    single `image` keeps `data-fancy-app-update-image=""`.

### Fixed

- The "+N" count badge over the stacked cards is readable in dark mode over a
  light image header. The fix is in react-fancy 5.51.1's `Toast.Stack`, which
  this package renders; update react-fancy to get it. The peer range is
  unchanged (`>=5.41.0 <6.0.0`).

## [0.3.0] - 2026-10-20

Nothing in this release changes what you already use: `AppUpdateAlert` and
`useAppUpdate` behave as before. **Nothing to do** unless you want the new notice.

### Added

- **`AppUpdateStack`, at `@particle-academy/fancy-app-update/stack`: a refresh
  notice that can say what is new.** The release's feature cards stack behind
  each other like react-fancy's `Toast.Stack` (scroll or arrow keys walk through
  them), each with a close button and a "Refresh to get the latest" button.
  - A feature's `image` runs full width as the card's header.
  - `features` is an array, or a loader called once when an update is
    detected. With no features (a hotfix), or a loader that returns nothing or
    fails, it shows the plain refresh notice.
  - Every label, the button colour, `className` / `cardClassName`, the position
    (the six presets, `"inline"`, or your own `style` over them), a card's
    content (`renderFeature`) and the whole notice (`render`) can be replaced.
  - Same detection options as `AppUpdateAlert`.
- **`@particle-academy/react-fancy` is an OPTIONAL peer** (`>=5.41.0 <6.0.0`),
  needed only by the `/stack` entry. The package root still imports nothing but
  React. **What to do:** install react-fancy if you use `AppUpdateStack`.

### Fixed

- **`CHANGELOG.md` is now in the published tarball.** `files` did not whitelist it, so npm never shipped it — and this package puts breaking changes in MINOR releases and tells you in the README to read the entry before taking one. The instruction existed for the author, who has the file, and not for the consumer, who is the only one being instructed. Nothing for you to do; the file simply arrives from this release on.

### Security

- `source-map-js` is pinned forward to `^1.2.2` via `overrides`. Versions up to
  1.2.1 allow an event-loop denial of service through indexed source-map section
  offsets, and it arrives here transitively through the build toolchain.
  **Nothing for a consumer to do, and no runtime change**: an npm package does
  not ship a lockfile, so this governs builds OF this repo, not anything
  installed FROM it. Recorded rather than left silent because the override it
  sits beside — `shell-quote` `^1.9.0`, added for an earlier advisory — was
  carried with no note of why, and had drifted back inside the vulnerable range
  before anyone looked.

## 0.2.0 — 2026-08-07

### Changed

- **BREAKING — Node 18 is no longer supported.** `engines.node` moves from `>=18` to `>=22`.

  **What you must do:** on Node 22 or newer, nothing. Note npm only *warns* on an `engines` mismatch while **pnpm fails the install**, so this surfaces differently depending on your package manager. Node 18 is end-of-life and 20 is maintenance-only.

- **BREAKING — React 18 is no longer supported.** `peerDependencies.react` / `react-dom` are now `^19.0.0`.

  **What you must do:** on React 19, nothing. On React 18, stay on the previous release, or upgrade your app to 19 first.

  React 18 support was a claim nothing tested — every build and test in this package ran against 19, so the 18 half of the old range was never executed. An untested compatibility claim is worse than an absent one, because it reads as support.

### Why

These are the kit 0.5 platform floors, applied across every package at once so a consumer never has to resolve a mix. **No API changed, nothing was removed, nothing was renamed** — only what the package requires.


## 0.1.1 — 2026-06-16

- Maintenance only (2 internal commits).

## 0.1.0 — 2026-06-14

### Added

- initial release — framework-agnostic "new version available, refresh" detector
