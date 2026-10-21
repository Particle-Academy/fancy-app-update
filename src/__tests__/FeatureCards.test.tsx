import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeatureCards, type FeatureCard } from "../cards";

/*
 * FeatureCards is the card presenter on its own: the stacked feature cards,
 * prev / next links, the scroll hint and the per-theme header image, with no
 * detector behind them. AppUpdateStack is built on it, and so is
 * fancy-whats-new -- which is why its data-* handles take a namespace: an agent
 * reading a What's New notice should not find it labelled "app update".
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CARDS: FeatureCard[] = [
  { id: "a", title: "Dark mode", eyebrow: "v1.4.0", image: "/img/light.png", imageDark: "/img/dark.png" },
  { id: "b", title: "Faster search", eyebrow: "v1.4.0" },
  { id: "c", title: "Exports to PDF", eyebrow: "v1.3.0", attributes: { "data-fancy-whats-new-version": "1.3.0" } },
];

const front = () => document.querySelector<HTMLElement>('[data-react-fancy-toast-stack-card="front"]')!;
const control = (ns: string, name: string) =>
  front().querySelector<HTMLButtonElement>(`[data-${ns}-control="${name}"]`)!;

describe("FeatureCards", () => {
  it("defaults to fancy-app-update's handles, so AppUpdateStack's DOM is unchanged", () => {
    render(<FeatureCards cards={CARDS} onClose={() => {}} position="inline" />);
    expect(document.querySelector("[data-fancy-app-update-stack]")).not.toBeNull();
    expect(front().querySelector("[data-fancy-app-update-card]")).not.toBeNull();
    expect(control("fancy-app-update", "close")).not.toBeNull();
  });

  it("namespaces every handle, the stylesheet and the keyframes", () => {
    render(<FeatureCards cards={CARDS} onClose={() => {}} namespace="fancy-whats-new" position="inline" />);
    expect(document.querySelector("[data-fancy-whats-new-stack]")).not.toBeNull();
    expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
    expect(front().querySelector("[data-fancy-whats-new-card]")).not.toBeNull();
    expect(control("fancy-whats-new", "next")).not.toBeNull();
    expect(front().querySelector("[data-fancy-whats-new-count]")!.textContent).toBe("1 of 3");

    const css = document.querySelector("style[data-fancy-whats-new-css]")!.textContent!;
    expect(css).toContain("[data-fancy-whats-new-link]");
    expect(css).toContain("@keyframes fancy-whats-new-scroll-hint");
    expect(css).not.toContain("fancy-app-update");

    const theme = document.querySelector("style[data-fancy-whats-new-theme-images]")!.textContent!;
    expect(theme).toContain('.dark [data-fancy-whats-new-image="dark"]{display:block}');
    expect(front().querySelector('img[data-fancy-whats-new-image="dark"]')!.getAttribute("src")).toBe("/img/dark.png");
  });

  it("shows each card's eyebrow above its title", () => {
    render(<FeatureCards cards={CARDS} onClose={() => {}} namespace="fancy-whats-new" position="inline" />);
    const eyebrow = front().querySelector("[data-fancy-whats-new-eyebrow]")!;
    expect(eyebrow.textContent).toBe("v1.4.0");
    // Above the title in document order.
    const title = screen.getAllByText("Dark mode")[0];
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a card with no eyebrow renders none", () => {
    render(<FeatureCards cards={[{ title: "Only" }]} onClose={() => {}} position="inline" />);
    expect(front().querySelector("[data-fancy-app-update-eyebrow]")).toBeNull();
  });

  it("puts a card's attributes on its root", () => {
    render(<FeatureCards cards={CARDS} onClose={() => {}} namespace="fancy-whats-new" position="inline" />);
    fireEvent.click(control("fancy-whats-new", "next"));
    fireEvent.click(control("fancy-whats-new", "next"));
    expect(front().querySelector('[data-fancy-whats-new-card][data-fancy-whats-new-version="1.3.0"]')).not.toBeNull();
  });

  it("the action button carries its own control name and label", () => {
    const onClick = vi.fn();
    render(
      <FeatureCards
        cards={CARDS}
        onClose={() => {}}
        action={{ label: "got it", onClick, control: "dismiss" }}
        position="inline"
      />,
    );
    const button = control("fancy-app-update", "dismiss");
    expect(button.textContent).toBe("got it");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("with no action there is no action button, only close", () => {
    render(<FeatureCards cards={CARDS} onClose={() => {}} position="inline" />);
    expect(front().querySelectorAll("button").length).toBe(3); // close, prev, next
  });

  it("close calls onClose", () => {
    const onClose = vi.fn();
    render(<FeatureCards cards={CARDS} onClose={onClose} position="inline" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("goes back to the first card when resetKey changes", () => {
    function Harness() {
      const [key, setKey] = useState("1.4.0");
      return (
        <>
          <button type="button" onClick={() => setKey("1.3.0")}>
            page
          </button>
          <FeatureCards cards={CARDS} onClose={() => {}} resetKey={key} position="inline" />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(control("fancy-app-update", "next"));
    expect(front().textContent).toContain("Faster search");
    act(() => {
      fireEvent.click(screen.getByText("page"));
    });
    expect(front().textContent).toContain("Dark mode");
  });

  it("renders nothing for no cards", () => {
    render(<FeatureCards cards={[]} onClose={() => {}} position="inline" />);
    expect(document.querySelector("[data-fancy-app-update-stack]")).toBeNull();
  });
});
