import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../platform/api/api-client";
import { deleteDynamic, getOwnDynamic } from "./community-api";
import {
  ownDynamicId,
  ownDynamicKeys,
  ownDynamicsParams,
  readOwnDynamics,
  verifyOwnDynamicAccount,
} from "./own-dynamics-query";

vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const me = {
  userId: 7,
  permissionKeys: [
    "community:dynamic:read-own",
    "community:dynamic:update-own",
  ],
};
describe("own dynamic route and protected pagination", () => {
  it.each([
    undefined,
    null,
    [],
    ["1"],
    "",
    "0",
    "-1",
    "1.1",
    "01",
    " 1",
    "1e2",
    "2147483648",
    "9007199254740993",
  ])("rejects ambiguous route %j", (value) =>
    expect(ownDynamicId(value)).toBeNull(),
  );
  it("accepts exactly the positive int4 route space", () => {
    expect(ownDynamicId("1")).toBe(1);
    expect(ownDynamicId("2147483647")).toBe(2147483647);
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: NaN },
    { page: 1, pageSize: 0 },
    { page: 1, pageSize: 101 },
    { page: 214748365, pageSize: 20 },
    { page: 1, status: "draft" as never },
  ])("rejects invalid pagination %j before requesting", async (input) => {
    expect(() => ownDynamicsParams(input)).toThrow();
    await expect(readOwnDynamics(7, input, signal())).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("uses only existing API query keys and partitions account/status/page", () => {
    expect(ownDynamicsParams({ page: 2, status: "hidden" }).toString()).toBe(
      "page=2&pageSize=20&status=hidden",
    );
    expect(ownDynamicKeys.list(7, 1)).not.toEqual(ownDynamicKeys.list(8, 1));
    expect(ownDynamicKeys.list(7, 1)).not.toEqual(
      ownDynamicKeys.list(7, 1, "pending"),
    );
    expect(ownDynamicKeys.list(7, 1)).not.toEqual(ownDynamicKeys.list(7, 2));
  });
  it.each([
    { ...me, userId: 8 },
    { userId: 7, permissionKeys: [] },
  ])(
    "stops a foreign or revoked reader before fetching private records",
    async (response) => {
      vi.mocked(apiRequest).mockResolvedValueOnce(response);
      await expect(
        readOwnDynamics(7, { page: 1 }, signal()),
      ).rejects.toMatchObject({ status: 403 });
      expect(apiRequest).toHaveBeenCalledTimes(1);
    },
  );
  it("uses update-own for deletion exactly as the backend does", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      userId: 7,
      permissionKeys: ["community:dynamic:read-own"],
    });
    await expect(
      verifyOwnDynamicAccount(7, signal(), true),
    ).rejects.toMatchObject({ status: 403 });
    vi.mocked(apiRequest).mockResolvedValueOnce(me);
    await expect(
      verifyOwnDynamicAccount(7, signal(), true),
    ).resolves.toBeUndefined();
  });
  it("verifies identity before and after protected content, keeping owner out of query input", async () => {
    const page = {
      items: [{ author: { userId: 7 } }],
      page: 2,
      total: 21,
      pageSize: 20,
      hasNext: false,
    };
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(me);
    const abort = signal();
    expect(await readOwnDynamics(7, { page: 2, status: "hidden" }, abort)).toBe(
      page,
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/me/dynamics?page=2&pageSize=20&status=hidden",
      { signal: abort },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/auth/me", {
      signal: abort,
      cache: "no-store",
    });
  });
  it("does not publish content if identity is revoked during the read", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce({ page: 1, items: [] })
      .mockResolvedValueOnce({ ...me, userId: 8 });
    await expect(
      readOwnDynamics(7, { page: 1 }, signal()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    { page: 2, items: [] },
    { page: 1, items: [{ author: { userId: 8 } }] },
  ])("rejects a mismatched protected result %j", async (page) => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(me);
    await expect(readOwnDynamics(7, { page: 1 }, signal())).rejects.toThrow(
      "不符",
    );
  });
  it("stops aborted reads before networking", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readOwnDynamics(7, { page: 1 }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2147483648])(
    "rejects invalid detail and delete ID %s",
    async (id) => {
      expect(() => getOwnDynamic(id)).toThrow();
      expect(() => deleteDynamic(id)).toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
});
