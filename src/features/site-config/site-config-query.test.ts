import {
  QueryClient,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import { siteConfigKeys, siteConfigQueryOptions } from "./site-config-query";
import type { SiteConfig } from "./site-config-api";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: "介绍",
  contactEmail: null,
  privacyPolicy: null,
  termsOfService: null,
  revision: "a".repeat(64),
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient();
});
afterEach(() => {
  client.clear();
  client.unmount();
  focusManager.setFocused(undefined);
});
describe("public config cache lifecycle (real TanStack Query, HTTP mocked)", () => {
  it("cancels a blurred page without aborting a different page's read", async () => {
    const first = deferred<SiteConfig>(),
      second = deferred<SiteConfig>();
    vi.mocked(apiRequest)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldRead = client
      .fetchQuery(siteConfigQueryOptions("profile", 1))
      .catch(() => null);
    const currentRead = client.fetchQuery(siteConfigQueryOptions("privacy", 1));
    const signals = vi
      .mocked(apiRequest)
      .mock.calls.map(([, options]) => options?.signal);
    await client.cancelQueries({ queryKey: siteConfigKeys.scope("profile") });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    first.resolve({ ...data, siteName: "旧名称" });
    second.resolve(data);
    expect(await currentRead).toEqual(data);
    expect(await oldRead).toBeNull();
    expect(
      client.getQueryData(siteConfigKeys.read("profile", 1)),
    ).toBeUndefined();
  });
  it("does not reuse a previous focus response or let its late reply overwrite the next one", async () => {
    const first = deferred<SiteConfig>(),
      second = deferred<SiteConfig>();
    vi.mocked(apiRequest)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldRead = client
      .fetchQuery(siteConfigQueryOptions("privacy", 1))
      .catch(() => null);
    await client.cancelQueries({ queryKey: siteConfigKeys.scope("privacy") });
    const freshRead = client.fetchQuery(siteConfigQueryOptions("privacy", 2));
    const fresh = {
      ...data,
      privacyPolicy: "新政策",
      revision: "b".repeat(64),
    };
    second.resolve(fresh);
    await freshRead;
    first.resolve({ ...data, privacyPolicy: "旧政策" });
    await oldRead;
    expect(client.getQueryData(siteConfigKeys.read("privacy", 2))).toEqual(
      fresh,
    );
    expect(
      client.getQueryData(siteConfigKeys.read("privacy", 1)),
    ).toBeUndefined();
  });
  it("deduplicates concurrent manual reloads with the same focus", async () => {
    const pending = deferred<SiteConfig>();
    vi.mocked(apiRequest).mockReturnValue(pending.promise);
    const observer = new QueryObserver(client, {
      ...siteConfigQueryOptions("terms", 1),
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    const first = observer.refetch({ cancelRefetch: false });
    const second = observer.refetch({ cancelRefetch: false });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    pending.resolve(data);
    expect((await first).data).toEqual(data);
    expect((await second).data).toEqual(data);
    unsubscribe();
  });
  it("stops on a malformed success without retrying or caching it as data", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...data, about: {} });
    await expect(
      client.fetchQuery(siteConfigQueryOptions("about", 1)),
    ).rejects.toThrow(TypeError);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryData(siteConfigKeys.read("about", 1)),
    ).toBeUndefined();
  });
  it("removes an unused policy cache entry after the observer leaves", async () => {
    vi.mocked(apiRequest).mockResolvedValue(data);
    const observer = new QueryObserver(
      client,
      siteConfigQueryOptions("about", 1),
    );
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch({ cancelRefetch: false });
    unsubscribe();
    await vi.waitFor(() =>
      expect(client.getQueryCache().getAll()).toHaveLength(0),
    );
  });
  it("does not silently refresh policy text on window focus", async () => {
    client.mount();
    vi.mocked(apiRequest).mockResolvedValue(data);
    const observer = new QueryObserver(
      client,
      siteConfigQueryOptions("privacy", 1),
    );
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch({ cancelRefetch: false });
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await Promise.resolve();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
