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
- `src/stack.tsx` — `AppUpdateStack`, the `./stack` entry: feature cards on
  react-fancy's `Toast.Stack`, with a plain notice when there are none.
- `src/position.ts` — the fixed positions both prompts share.

## Invariants

- **The package root imports nothing but React.** react-fancy is an OPTIONAL
  peer reached only from `./stack`; it is external in `tsup.config.ts`. Check
  `dist/index.js` for `react-fancy` after a build — it must be absent.
- **A network failure is never an update.** Every detector path returns `false`
  on error. A false positive asks people to reload for nothing, and they learn
  to ignore the prompt.
- **An update message is optional.** `AppUpdateStack` with no features, or a
  loader that returns nothing or throws, still shows the refresh notice — a
  hotfix has no notes and still needs the reload.
- **The feature loader runs once, when an update is detected**, never on a page
  load that sees none.
- **A card's image is a full-width header**, so the card's own padding is zeroed
  (`p-0 overflow-hidden` merged into `cardClassName`) and the body pads itself.
  Those two classes are ones react-fancy's dist already contains, so a consumer
  scanning react-fancy generates them.

## Checking a change

`npm test` (vitest + jsdom). The hook checks on an interval, not on mount, so
tests pass a short `interval` with `check: () => true`. jsdom does not lay out:
look at the stack in a real browser, with Tailwind built from react-fancy's
`dist` the way a consumer's is.
