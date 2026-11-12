import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../platform/api/api-client";
import {
  getOwnDynamic,
  getOwnDynamics,
  updateDynamic,
  deleteDynamic,
  createDynamic,
  getSelectableResorts,
} from "./community-api";

vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe("own dynamics transport", () => {
  it("sends null to unlink, omits unchanged fields and preserves explicit image replacements", async () => {
    await updateDynamic(8, { resortId: null, imageAssetIds: ["14", "12"] });
    await updateDynamic(8, { content: "正文" });
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/dynamics/8", {
      method: "PATCH",
      body: { resortId: null, imageAssetIds: ["14", "12"] },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/dynamics/8", {
      method: "PATCH",
      body: { content: "正文" },
    });
  });
  it("uses the existing public resort search with bounded offset pages and encodes the search", async () => {
    const signal = new AbortController().signal;
    await getSelectableResorts({ page: 2, keyword: "  雪 & 山  " }, signal);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      `/resorts?page=2&pageSize=10&sortBy=name&sortOrder=asc&keyword=${encodeURIComponent("雪 & 山").replaceAll("%20", "+")}`,
      { signal },
    );
  });

  it("forwards selected resort and explicit image order without author or moderation fields", async () => {
    await createDynamic({
      content: "新动态",
      resortId: 7,
      imageAssetIds: ["12", "10"],
    });
    await updateDynamic(8, { content: "编辑", resortId: 9 });
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/dynamics", {
      method: "POST",
      body: { content: "新动态", resortId: 7, imageAssetIds: ["12", "10"] },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/dynamics/8", {
      method: "PATCH",
      body: { content: "编辑", resortId: 9 },
    });
  });
  it("uses offset pagination and omits the all-status filter and owner input", async () => {
    const signal = new AbortController().signal;
    await getOwnDynamics({ page: 2 }, signal);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/me/dynamics?page=2&pageSize=20",
      { signal },
    );
  });
  it.each(["pending", "published", "hidden"] as const)(
    "forwards the %s filter",
    async (status) => {
      await getOwnDynamics({ page: 1, pageSize: 10, status });
      expect(apiRequest).toHaveBeenCalledWith(
        `/me/dynamics?page=1&pageSize=10&status=${status}`,
        { signal: undefined },
      );
    },
  );
  it("reads nonpublic content from the protected own detail endpoint and preserves existing owner-write commands", async () => {
    await getOwnDynamic(12);
    await updateDynamic(12, { content: "edited" });
    await deleteDynamic(12);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/me/dynamics/12", {
      signal: undefined,
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/dynamics/12", {
      method: "PATCH",
      body: { content: "edited" },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/dynamics/12", {
      method: "DELETE",
    });
  });
});
