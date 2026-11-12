import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import { getSiteConfig, policyText, type SiteConfig } from "./site-config-api";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: null,
  contactEmail: null,
  privacyPolicy: null,
  termsOfService: null,
  revision: "a".repeat(64),
};
describe("Public site configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockResolvedValue(data);
  });
  it("uses public no-store transport without triggering auth refresh", async () => {
    const abort = new AbortController();
    await getSiteConfig(abort.signal);
    expect(apiRequest).toHaveBeenCalledWith("/public/config", {
      cache: "no-store",
      skipAuthRefresh: true,
      signal: abort.signal,
    });
  });
  it("shows explicit missing and unpublished values", () => {
    expect(policyText(data, "about")).toBe("平台介绍尚未配置。");
    expect(policyText(data, "privacyPolicy")).toBe("尚未发布正式内容。");
    expect(policyText(data, "termsOfService")).toBe("尚未发布正式内容。");
  });
  it("returns plain multiline text without interpreting markup", () => {
    const content = "<script>literal</script>\n第二段";
    expect(
      policyText({ ...data, privacyPolicy: content }, "privacyPolicy"),
    ).toBe(content);
  });
  it.each([
    null,
    [],
    { ...data, siteName: " " },
    { ...data, tagline: 1 },
    { ...data, about: {} },
    { ...data, contactEmail: undefined },
    { ...data, privacyPolicy: ["unexpected"] },
    { ...data, termsOfService: "x".repeat(30001) },
    { ...data, revision: "not-a-revision" },
  ])("rejects malformed public configuration %#", async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(getSiteConfig()).rejects.toThrow(TypeError);
  });
  it("keeps only the fixed public projection in client state", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...data,
      internalKey: "private",
    });
    expect(await getSiteConfig()).toEqual(data);
  });
  it("does not start an already cancelled read", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(getSiteConfig(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not publish a late response after cancellation", async () => {
    const abort = new AbortController();
    vi.mocked(apiRequest).mockImplementation(async () => {
      abort.abort();
      return data;
    });
    await expect(getSiteConfig(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("accepts the catalog limits as Unicode code points and preserves multiline text", async () => {
    const value = {
      ...data,
      siteName: "雪".repeat(50),
      tagline: "🏂".repeat(200),
      about: "🏔".repeat(10000),
      privacyPolicy: "第一行\n" + "雪".repeat(29996),
      termsOfService: "雪".repeat(30000),
    };
    vi.mocked(apiRequest).mockResolvedValue(value);
    expect(await getSiteConfig()).toEqual(value);
  });
});
