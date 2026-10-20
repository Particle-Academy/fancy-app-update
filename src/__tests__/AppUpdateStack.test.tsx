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
