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

/**
 * A fetch mock keyed by URL. Each entry is a validator set, an HTTP failure
 * (`{ status }`) or a network error (`"offline"`). An unknown URL rejects, so a
 * detector that fetches the wrong thing reads as a failure, never a pass.
 */
type Reply = { etag?: string; lastModified?: string; status?: number } | "offline";
function stubUrls(replies: Record<string, Reply>) {
  const fetchMock = vi.fn(async (url: unknown) => {
    const reply = typeof url === "string" ? replies[url] : undefined;
    if (reply === undefined || reply === "offline") throw new Error(`offline: ${String(url)}`);
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h: string) =>
          h === "etag" ? (reply.etag ?? null) : h === "last-modified" ? (reply.lastModified ?? null) : null,
      },
    };
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe("useAppUpdate — several ETag URLs", () => {
  it("fires when only the data URL changes", async () => {
    const replies: Record<string, Reply> = { "/": { etag: "page-1" }, "/data.json": { etag: "data-1" } };
    const fetchMock = stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: ["/", "/data.json"], pollOnFocus: false }));

    await act(async () => result.current.check()); // records both
    expect(result.current.updateAvailable).toBe(false);
    await act(async () => result.current.check()); // nothing moved
    expect(result.current.updateAvailable).toBe(false);

    replies["/data.json"] = { etag: "data-2" };
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);

    for (const url of ["/", "/data.json"]) {
      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD", cache: "no-store" }));
    }
  });

  it("uses Last-Modified when a URL sends no ETag", async () => {
    const replies: Record<string, Reply> = { "/": { etag: "page-1" }, "/data.json": { lastModified: "Mon" } };
    stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: ["/", "/data.json"], pollOnFocus: false }));
    await act(async () => result.current.check());
    replies["/data.json"] = { lastModified: "Tue" };
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
  });

  it("does not fire when one URL fails and the other is unchanged, and the failure poisons nothing", async () => {
    const replies: Record<string, Reply> = { "/": { etag: "page-1" }, "/data.json": { etag: "data-1" } };
    stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: ["/", "/data.json"], pollOnFocus: false }));
    await act(async () => result.current.check()); // records both

    replies["/data.json"] = "offline";
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);

    replies["/data.json"] = { status: 503, etag: "maintenance-page" }; // non-2xx: skipped, not a change
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);

    replies["/"] = { etag: "page-2" }; // the healthy URL still detects
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
  });

  it("skips a URL with no validator", async () => {
    const replies: Record<string, Reply> = { "/": {}, "/data.json": { etag: "data-1" } };
    stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: ["/", "/data.json"], pollOnFocus: false }));
    await act(async () => result.current.check());
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);

    replies["/data.json"] = { etag: "data-2" }; // the URL that has one still counts
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
  });

  it("records a URL that fails first and appears later, with no alert", async () => {
    const replies: Record<string, Reply> = { "/": { etag: "page-1" }, "/data.json": "offline" };
    stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: ["/", "/data.json"], pollOnFocus: false }));
    await act(async () => result.current.check()); // records "/" only

    replies["/data.json"] = { etag: "data-1" }; // first sight: recorded, not a change
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);

    replies["/data.json"] = { etag: "data-2" };
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
  });

  it("a single string URL makes exactly today's request and detects as today", async () => {
    const replies: Record<string, Reply> = { "/app": { etag: "v1" } };
    const fetchMock = stubUrls(replies);
    const { result } = renderHook(() => useAppUpdate({ pingUrl: "/app", pollOnFocus: false }));
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/app", { method: "HEAD", cache: "no-store", credentials: "same-origin" });

    replies["/app"] = { etag: "v2" };
    await act(async () => result.current.check());
    expect(result.current.updateAvailable).toBe(true);
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
