import { afterEach, describe, expect, it, vi } from "vitest";
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
