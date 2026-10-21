import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppUpdateStack, type AppUpdateFeature } from "../stack";

/*
 * The stacked variant: when a new build lands, the release's feature cards
 * stack like react-fancy's Toast.Stack, each with a close button and a
 * "Refresh to get the latest" action. A release with no message -- a hotfix --
 * still gets the plain refresh notice.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The hook checks on an interval; a short one stands in for "a deploy landed".
const detected = { check: () => true, interval: 5, pollOnFocus: false } as const;

const FEATURES: AppUpdateFeature[] = [
  { id: "a", title: "Dark mode", description: "Every page, both modes.", image: "/img/dark.png", imageAlt: "Dark mode preview" },
  { id: "b", title: "Faster search" },
  { id: "c", title: "Exports to PDF" },
];

const cards = () => document.querySelectorAll("[data-react-fancy-toast-stack-card]");
const front = () => document.querySelector<HTMLElement>('[data-react-fancy-toast-stack-card="front"]')!;

describe("AppUpdateStack", () => {
  it("renders nothing until an update is detected", async () => {
    render(<AppUpdateStack check={() => false} interval={5} pollOnFocus={false} features={FEATURES} />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
  });

  it("a hotfix with no update message still gets the refresh notice", async () => {
    const onRefresh = vi.fn();
    render(<AppUpdateStack {...detected} onRefresh={onRefresh} />);
    await waitFor(() => expect(cards().length).toBe(1));
    expect(front().textContent).toContain("Update available");
    fireEvent.click(screen.getByRole("button", { name: "Refresh to get the latest" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("stacks the feature cards, the first in front, with its image as a full-width header", async () => {
    render(<AppUpdateStack {...detected} features={FEATURES} />);
    await waitFor(() => expect(cards().length).toBe(3));
    expect(front().textContent).toContain("Dark mode");
    expect(front().textContent).toContain("Every page, both modes.");

    const img = front().querySelector<HTMLImageElement>("img[data-fancy-app-update-image]")!;
    expect(img.getAttribute("src")).toBe("/img/dark.png");
    expect(img.getAttribute("alt")).toBe("Dark mode preview");
    // First thing in the card, edge to edge.
    expect(img.style.width).toContain("100%");

    // A card with no image has no header.
    fireEvent.keyDown(document.querySelector("[data-react-fancy-toast-stack]")!, { key: "ArrowDown" });
    expect(front().textContent).toContain("Faster search");
    expect(front().querySelector("img")).toBeNull();
    // Where you are in the stack is visible, not only announced.
    expect(front().textContent).toContain("2 of 3");
  });

  /*
   * fancy-app-update#1 (MOIC), the nice-to-have: a release can show a dark
   * screenshot to someone in dark mode. The kit's dark mode is the `.dark`
   * class on an ancestor, so the swap is CSS keyed off that class -- no JS, so
   * it is right on the first paint and follows a theme toggle live. jsdom
   * cascades `display` from a stylesheet, so this checks the swap itself.
   */
  describe("imageDark", () => {
    const THEMED: AppUpdateFeature[] = [
      { id: "a", title: "Dark mode", image: "/img/light.png", imageDark: "/img/dark.png", imageAlt: "Preview" },
      { id: "b", title: "Faster search" },
    ];
    const header = (theme: "light" | "dark") =>
      front().querySelector<HTMLImageElement>(`img[data-fancy-app-update-image="${theme}"]`)!;
    const shown = (el: HTMLElement) => getComputedStyle(el).display !== "none";

    afterEach(() => document.documentElement.classList.remove("dark"));

    it("renders both headers with the same alt, and shows the light one outside dark mode", async () => {
      render(<AppUpdateStack {...detected} features={THEMED} />);
      await waitFor(() => expect(cards().length).toBe(2));

      expect(header("light").getAttribute("src")).toBe("/img/light.png");
      expect(header("dark").getAttribute("src")).toBe("/img/dark.png");
      expect(header("light").getAttribute("alt")).toBe("Preview");
      expect(header("dark").getAttribute("alt")).toBe("Preview");
      // An inline display would beat the stylesheet and pin one image on.
      expect(header("light").style.display).toBe("");
      expect(header("dark").style.display).toBe("");

      expect(shown(header("light"))).toBe(true);
      expect(shown(header("dark"))).toBe(false);
    });

    /*
     * The theme is set BEFORE render in every case here. jsdom invalidates its
     * computed-style cache on child-list, text and stylesheet changes but NOT
     * on an attribute change, so toggling `.dark` mid-test reads a stale
     * `display` depending on what an earlier test computed. A live toggle is a
     * browser behaviour; it is checked in a real browser, not here.
     */
    it("shows the dark one instead under a `.dark` ancestor", async () => {
      document.documentElement.classList.add("dark");
      render(<AppUpdateStack {...detected} features={THEMED} />);
      await waitFor(() => expect(cards().length).toBe(2));

      expect(shown(header("dark"))).toBe(true);
      expect(shown(header("light"))).toBe(false);
    });

    it("a card with only `image` is unchanged: one header, in both themes", async () => {
      document.documentElement.classList.add("dark");
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      const imgs = front().querySelectorAll<HTMLImageElement>("img[data-fancy-app-update-image]");
      expect(imgs).toHaveLength(1);
      expect(shown(imgs[0])).toBe(true);
    });

    const onlyDark: AppUpdateFeature[] = [{ id: "a", title: "Dark mode", imageDark: "/img/dark.png" }];

    it("a card with only `imageDark` has no header in light mode", async () => {
      render(<AppUpdateStack {...detected} features={onlyDark} />);
      await waitFor(() => expect(cards().length).toBe(1));

      expect(front().querySelector('img[data-fancy-app-update-image="light"]')).toBeNull();
      expect(shown(header("dark"))).toBe(false);
    });

    it("a card with only `imageDark` has its header in dark mode", async () => {
      document.documentElement.classList.add("dark");
      render(<AppUpdateStack {...detected} features={onlyDark} />);
      await waitFor(() => expect(cards().length).toBe(1));

      expect(shown(header("dark"))).toBe(true);
    });
  });

  it("loads the update message only once an update is detected", async () => {
    const load = vi.fn(async () => FEATURES.slice(0, 2));
    render(<AppUpdateStack check={() => false} interval={5} pollOnFocus={false} features={load} />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(load).not.toHaveBeenCalled();

    cleanup();
    render(<AppUpdateStack {...detected} features={load} />);
    await waitFor(() => expect(cards().length).toBe(2));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plain notice when the message loader returns nothing or fails", async () => {
    render(<AppUpdateStack {...detected} features={async () => []} />);
    await waitFor(() => expect(cards().length).toBe(1));
    expect(front().textContent).toContain("Update available");
    cleanup();

    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppUpdateStack {...detected} features={() => Promise.reject(new Error("offline"))} />);
    await waitFor(() => expect(cards().length).toBe(1));
    expect(screen.getByRole("button", { name: "Refresh to get the latest" })).toBeTruthy();
  });

  it("the close button dismisses the whole notice", async () => {
    const onDismiss = vi.fn();
    render(<AppUpdateStack {...detected} features={FEATURES} onDismiss={onDismiss} />);
    await waitFor(() => expect(cards().length).toBe(3));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("lets the developer change the words, the placement and the styling", async () => {
    render(
      <AppUpdateStack
        {...detected}
        title="We shipped a fix"
        description="Nothing new to see, just better."
        refreshLabel="Reload now"
        closeLabel="Hide"
        position="top"
        className="my-stack"
        cardClassName="my-card"
        style={{ top: 72 }}
      />,
    );
    await waitFor(() => expect(cards().length).toBe(1));
    const root = document.querySelector<HTMLElement>("[data-fancy-app-update-stack]")!;
    expect(root.getAttribute("data-position")).toBe("top");
    expect(root.style.position).toBe("fixed");
    // The developer's style wins over the preset.
    expect(root.style.top).toBe("72px");
    expect(document.querySelector(".my-stack")).not.toBeNull();
    expect(front().className).toContain("my-card");
    expect(front().textContent).toContain("We shipped a fix");
    expect(front().textContent).toContain("Nothing new to see, just better.");
    expect(screen.getByRole("button", { name: "Reload now" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });

  it("inline renders where it is placed, not in a portal", async () => {
    const { container } = render(<AppUpdateStack {...detected} position="inline" />);
    await waitFor(() => expect(container.querySelector("[data-fancy-app-update-stack]")).not.toBeNull());
    expect(container.querySelector<HTMLElement>("[data-fancy-app-update-stack]")!.style.position).not.toBe("fixed");
  });

  it("renderFeature replaces a card's content; the close and refresh controls stay", async () => {
    render(
      <AppUpdateStack
        {...detected}
        features={FEATURES}
        renderFeature={(f, { index, count }) => <p data-testid="mine">{`${f.title} (${index + 1}/${count})`}</p>}
      />,
    );
    await waitFor(() => expect(cards().length).toBe(3));
    expect(front().querySelector("[data-testid=mine]")!.textContent).toBe("Dark mode (1/3)");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh to get the latest" })).toBeTruthy();
  });

  /*
   * fancy-app-update#2 (MOIC): scroll-to-advance is not discoverable. Each
   * feature card carries visible Previous / Next buttons beside its "N of M",
   * and they move the SAME index the wheel and the arrow keys move.
   * Testing-library's role queries skip the `aria-hidden` cards behind, so a
   * button found by name is the front card's.
   */
  describe("Previous / Next", () => {
    const count = () => front().querySelector("[data-fancy-app-update-count]")!.textContent;
    const btn = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
    const stackEl = () => document.querySelector<HTMLElement>("[data-react-fancy-toast-stack]")!;

    it("are on the front card, and walk the cards forwards and back", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      expect(front().contains(btn("prev"))).toBe(true);
      expect(front().contains(btn("next"))).toBe(true);
      expect(count()).toBe("1 of 3");

      fireEvent.click(btn("next"));
      expect(count()).toBe("2 of 3");
      expect(front().textContent).toContain("Faster search");

      fireEvent.click(btn("next"));
      expect(count()).toBe("3 of 3");
      expect(front().textContent).toContain("Exports to PDF");

      fireEvent.click(btn("prev"));
      expect(count()).toBe("2 of 3");
      expect(front().textContent).toContain("Faster search");
    });

    it("stop at the ends: Previous is disabled on the first card, Next on the last", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      expect(btn("prev").disabled).toBe(true);
      expect(btn("next").disabled).toBe(false);
      fireEvent.click(btn("prev"));
      expect(count()).toBe("1 of 3");

      fireEvent.click(btn("next"));
      fireEvent.click(btn("next"));
      expect(count()).toBe("3 of 3");
      expect(btn("next").disabled).toBe(true);
      expect(btn("prev").disabled).toBe(false);
      fireEvent.click(btn("next"));
      expect(count()).toBe("3 of 3");
    });

    it("move the same card the arrow keys and the wheel move", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      fireEvent.click(btn("next"));
      expect(count()).toBe("2 of 3");
      fireEvent.keyDown(stackEl(), { key: "ArrowDown" });
      expect(count()).toBe("3 of 3");
      // The buttons read the index the keys moved, so Next is now at its end.
      expect(btn("next").disabled).toBe(true);
      fireEvent.click(btn("prev"));
      expect(count()).toBe("2 of 3");
      fireEvent.wheel(stackEl(), { deltaY: -100 });
      expect(count()).toBe("1 of 3");
      expect(btn("prev").disabled).toBe(true);
    });

    it("an arrow key on a focused button steps once, not twice", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      btn("next").focus();
      fireEvent.keyDown(btn("next"), { key: "ArrowRight" });
      expect(count()).toBe("2 of 3");
    });

    it("keep focus on the front card when it changes", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      btn("next").focus();
      fireEvent.click(btn("next"));
      // The card that held focus is now behind, and inert.
      expect(document.activeElement).toBe(btn("next"));
      expect(front().contains(document.activeElement)).toBe(true);

      // Next is disabled on the last card, so focus lands on Previous.
      fireEvent.click(btn("next"));
      expect(count()).toBe("3 of 3");
      expect(document.activeElement).toBe(btn("prev"));

      // An arrow key from a focused button keeps focus on the front card too.
      fireEvent.keyDown(btn("prev"), { key: "ArrowUp" });
      expect(count()).toBe("2 of 3");
      expect(document.activeElement).toBe(btn("prev"));
    });

    it("take their labels from previousLabel / nextLabel", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} previousLabel="Back" nextLabel="Onward" />);
      await waitFor(() => expect(cards().length).toBe(3));

      fireEvent.click(btn("Onward"));
      expect(count()).toBe("2 of 3");
      fireEvent.click(btn("Back"));
      expect(count()).toBe("1 of 3");
      expect(screen.queryByRole("button", { name: "next" })).toBeNull();
    });

    it("show from two cards, and are absent with one: the hotfix notice and a one-feature release", async () => {
      // The positive half first, so this cannot pass on code that has no buttons at all.
      render(<AppUpdateStack {...detected} features={FEATURES.slice(0, 2)} />);
      await waitFor(() => expect(cards().length).toBe(2));
      expect(btn("prev")).toBeTruthy();
      expect(btn("next")).toBeTruthy();
      cleanup();

      render(<AppUpdateStack {...detected} />);
      await waitFor(() => expect(cards().length).toBe(1));
      // By the control, not the word, so a label change cannot make this pass.
      expect(document.querySelector("[data-fancy-app-update-nav]")).toBeNull();
      expect(document.querySelector('[data-fancy-app-update-control="next"]')).toBeNull();
      cleanup();

      render(<AppUpdateStack {...detected} features={FEATURES.slice(0, 1)} />);
      await waitFor(() => expect(cards().length).toBe(1));
      expect(document.querySelector("[data-fancy-app-update-nav]")).toBeNull();
      expect(document.querySelector('[data-fancy-app-update-control="previous"]')).toBeNull();
    });

    /*
     * The owner's direction for 0.6.0: prev / next are small lowercase LINKS,
     * not buttons in the button style -- but still real <button>s, so they are
     * reachable by Tab and work with Enter / Space. The underline-on-hover is a
     * rule in the notice's own stylesheet (not a Tailwind class react-fancy's
     * dist may lack); jsdom cannot hover, so the browser checks the look.
     */
    it("are small lowercase links that are still real buttons", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      for (const b of [btn("prev"), btn("next")]) {
        expect(b.tagName).toBe("BUTTON");
        expect(b.getAttribute("type")).toBe("button");
        expect(b.hasAttribute("data-fancy-app-update-link")).toBe(true);
        // No button chrome: no padding box, no fill.
        expect(b.style.padding).toBe("0px");
        expect(b.style.background).toContain("transparent");
      }
      const css = document.querySelector("style[data-fancy-app-update-css]")!.textContent!;
      expect(css).toContain("[data-fancy-app-update-link]:not(:disabled):hover");
      expect(css).toContain("text-decoration:underline");
      // Button's focus ring hugs a padding-less link: off for pointer focus
      // (focus follows the control after a click), kept for the keyboard.
      expect(css).toContain("[data-fancy-app-update-link]:focus:not(:focus-visible){box-shadow:none}");
    });

    it("stay when renderFeature replaces a card's content", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} renderFeature={(f) => <p>{f.title}</p>} />);
      await waitFor(() => expect(cards().length).toBe(3));

      fireEvent.click(btn("next"));
      expect(front().textContent).toContain("Faster search");
      expect(count()).toBe("2 of 3");
      fireEvent.click(btn("prev"));
      expect(front().textContent).toContain("Dark mode");
    });
  });

  /*
   * The owner's direction for 0.6.0: a watermark that says the stack scrolls.
   * It fades in when the pointer enters, stays briefly, and fades out on its
   * own. The fade is a CSS animation keyed off a data attribute, in the
   * notice's own stylesheet -- jsdom does not run animations, so the fade
   * itself is checked in a real browser. What jsdom CAN see is checked here.
   */
  describe("scroll hint", () => {
    const hint = () => document.querySelector<HTMLElement>("[data-fancy-app-update-scroll-hint]");
    const root = () => document.querySelector<HTMLElement>("[data-fancy-app-update-stack]")!;
    const css = () => document.querySelector("style[data-fancy-app-update-css]")!.textContent!;

    it("appears on the front card when the pointer enters a stack of two or more", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));
      expect(hint()).toBeNull();

      fireEvent.pointerEnter(root());
      expect(hint()).not.toBeNull();
      expect(front().contains(hint())).toBe(true);
      expect(hint()!.getAttribute("data-fancy-app-update-scroll-hint")).toBe("show");
      expect(hint()!.textContent).toContain("scroll");
    });

    it("never blocks a click, shifts nothing and is not read out", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.pointerEnter(root());

      expect(hint()!.style.pointerEvents).toBe("none");
      expect(hint()!.style.position).toBe("absolute");
      expect(hint()!.getAttribute("aria-hidden")).toBe("true");
    });

    it("fades by a keyframe animation, and does not move under prefers-reduced-motion", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));

      expect(css()).toContain("@keyframes fancy-app-update-scroll-hint");
      expect(css()).toContain('[data-fancy-app-update-scroll-hint="show"]');
      expect(css()).toContain("@media (prefers-reduced-motion: reduce)");
    });

    it("does not appear with one card", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES.slice(0, 1)} />);
      await waitFor(() => expect(cards().length).toBe(1));
      fireEvent.pointerEnter(root());
      expect(hint()).toBeNull();
      // ...while a two-card stack does, so this is not passing for want of a hint at all.
      cleanup();
      render(<AppUpdateStack {...detected} features={FEATURES.slice(0, 2)} />);
      await waitFor(() => expect(cards().length).toBe(2));
      fireEvent.pointerEnter(root());
      expect(hint()).not.toBeNull();
    });

    it("scrollHint={false} turns it off; a string replaces its words", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} scrollHint="scroll to browse" />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.pointerEnter(root());
      expect(hint()!.textContent).toContain("scroll to browse");
      cleanup();

      render(<AppUpdateStack {...detected} features={FEATURES} scrollHint={false} />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.pointerEnter(root());
      expect(hint()).toBeNull();
    });

    it("goes away once the person has moved through the cards", async () => {
      render(<AppUpdateStack {...detected} features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.pointerEnter(root());
      expect(hint()).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "next" }));
      expect(hint()).toBeNull();
    });
  });

  /*
   * fancy-app-update#3 (MOIC): a "What's New" menu item re-opens the latest
   * feature cards on demand. `open` shows the stack whether or not an update
   * was detected; opened that way, with no update pending, there is nothing
   * to reload, so "got it" replaces the refresh action.
   */
  describe("open on demand", () => {
    const none = { check: () => false, interval: 5, pollOnFocus: false } as const;
    const wait = () => act(async () => new Promise((r) => setTimeout(r, 30)));

    it("shows the cards with no update detected, with prev / next and no refresh", async () => {
      render(<AppUpdateStack {...none} open features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));
      expect(front().textContent).toContain("Dark mode");
      expect(screen.queryByRole("button", { name: "Refresh to get the latest" })).toBeNull();
      expect(screen.getByRole("button", { name: "got it" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "next" })).toBeTruthy();
    });

    it("stays hidden while closed, and shows when `open` turns true", async () => {
      const { rerender } = render(<AppUpdateStack {...none} open={false} features={FEATURES} />);
      await wait();
      expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
      rerender(<AppUpdateStack {...none} open features={FEATURES} />);
      await waitFor(() => expect(cards().length).toBe(3));
    });

    it('"got it" and the close button ask to close through onOpenChange(false)', async () => {
      const onOpenChange = vi.fn();
      function Menu() {
        const [open, setOpen] = useState(true);
        return (
          <AppUpdateStack
            {...none}
            open={open}
            onOpenChange={(o) => {
              onOpenChange(o);
              setOpen(o);
            }}
            features={FEATURES}
          />
        );
      }
      render(<Menu />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.click(screen.getByRole("button", { name: "got it" }));
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
      cleanup();

      onOpenChange.mockClear();
      render(<Menu />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
    });

    it("dismissLabel changes the words", async () => {
      render(<AppUpdateStack {...none} open features={FEATURES} dismissLabel="Thanks!" />);
      await waitFor(() => expect(cards().length).toBe(3));
      expect(screen.getByRole("button", { name: "Thanks!" })).toBeTruthy();
    });

    it("with an update ALSO pending, keeps the refresh action -- there is a new build to load", async () => {
      const onOpenChange = vi.fn();
      const onDismiss = vi.fn();
      render(<AppUpdateStack {...detected} open onOpenChange={onOpenChange} onDismiss={onDismiss} features={FEATURES} />);
      await waitFor(() => expect(screen.queryByRole("button", { name: "Refresh to get the latest" })).not.toBeNull());
      expect(screen.queryByRole("button", { name: "got it" })).toBeNull();

      // Closing closes both: the on-demand view AND the update notice, or the
      // close button would appear to do nothing.
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("runs a feature loader when opened, with no update detected", async () => {
      const load = vi.fn(async () => FEATURES.slice(0, 2));
      render(<AppUpdateStack {...none} open features={load} />);
      await waitFor(() => expect(cards().length).toBe(2));
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("shows nothing when opened with no cards: there is no news to show", async () => {
      // Not the plain "Update available" card: no update is pending.
      const { rerender } = render(<AppUpdateStack {...none} open features={[]} />);
      await wait();
      expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
      // ...and it appears as soon as there are cards to show.
      rerender(<AppUpdateStack {...none} open features={FEATURES.slice(0, 1)} />);
      await waitFor(() => expect(cards().length).toBe(1));
      expect(front().textContent).toContain("Dark mode");
    });

    it("starts at the first card each time it opens", async () => {
      function Menu() {
        const [open, setOpen] = useState(true);
        return (
          <>
            <button onClick={() => setOpen(true)}>whats-new</button>
            <AppUpdateStack {...none} open={open} onOpenChange={setOpen} features={FEATURES} />
          </>
        );
      }
      render(<Menu />);
      await waitFor(() => expect(cards().length).toBe(3));
      fireEvent.click(screen.getByRole("button", { name: "next" }));
      expect(front().textContent).toContain("Faster search");
      fireEvent.click(screen.getByRole("button", { name: "got it" }));
      fireEvent.click(screen.getByRole("button", { name: "whats-new" }));
      await waitFor(() => expect(cards().length).toBe(3));
      expect(front().textContent).toContain("Dark mode");
    });

    it("render receives whether an update is pending", async () => {
      render(
        <AppUpdateStack
          {...none}
          open
          features={FEATURES}
          render={({ updateAvailable, features }) => <div data-testid="own">{`${features.length}:${updateAvailable}`}</div>}
        />,
      );
      await waitFor(() => expect(screen.getByTestId("own").textContent).toBe("3:false"));
    });
  });

  it("render replaces the whole notice and receives the features", async () => {
    render(
      <AppUpdateStack
        {...detected}
        features={FEATURES}
        render={({ features, refresh, dismiss }) => (
          <div data-testid="own">
            {features.length} new
            <button onClick={refresh}>r</button>
            <button onClick={dismiss}>d</button>
          </div>
        )}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("own").textContent).toContain("3 new"));
    expect(cards().length).toBe(0);
  });
});
