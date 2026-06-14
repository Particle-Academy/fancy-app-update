import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppUpdate } from "../useAppUpdate";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAppUpdate — custom check", () => {
  it("flags an update when check resolves true + fires onUpdateAvailable once", async () => {
    const onUpd = vi.fn();
    const { result } = renderHook(() =>
      useAppUpdate({ check: () => true, pollOnFocus: false, onUpdateAvailable: onUpd }),
    );
    expect(result.current.updateAvailable).toBe(false);
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
    expect(onUpd).toHaveBeenCalledTimes(1);
  });

  it("stays false when check resolves false", async () => {
    const { result } = renderHook(() => useAppUpdate({ check: async () => false, pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
  });
});

describe("useAppUpdate — version compare", () => {
  it("update when the deployed version differs", async () => {
    const { result } = renderHook(() =>
      useAppUpdate({ currentVersion: "abc", latestVersion: async () => "def", pollOnFocus: false }),
    );
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
  });

  it("no update when versions match", async () => {
    const { result } = renderHook(() =>
      useAppUpdate({ currentVersion: "abc", latestVersion: () => "abc", pollOnFocus: false }),
    );
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
  });
});

describe("useAppUpdate — ETag fallback", () => {
  it("baselines on the first check, flags on a changed ETag", async () => {
    let etag = "W/\"v1\"";
    const fetchMock = vi.fn(async () => ({ headers: { get: (h: string) => (h === "etag" ? etag : null) } }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useAppUpdate({ pollOnFocus: false }));

    await act(async () => result.current.check()); // baseline v1
    expect(result.current.updateAvailable).toBe(false);

    etag = "W/\"v2\""; // a deploy changes the index.html validator
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "HEAD" }));
  });

  it("never false-positives without a validator header", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ headers: { get: () => null } })) as unknown as typeof fetch);
    const { result } = renderHook(() => useAppUpdate({ pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
  });

  it("never false-positives on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch);
    const { result } = renderHook(() => useAppUpdate({ pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
  });
});

describe("useAppUpdate — lifecycle", () => {
  it("dismiss hides + suppresses further detection", async () => {
    const { result } = renderHook(() => useAppUpdate({ check: () => true, pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.updateAvailable).toBe(false);
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
  });

  it("does not check when disabled", async () => {
    const check = vi.fn(() => true);
    const { result } = renderHook(() => useAppUpdate({ enabled: false, check, pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
});
