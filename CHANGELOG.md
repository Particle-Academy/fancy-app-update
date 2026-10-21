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
