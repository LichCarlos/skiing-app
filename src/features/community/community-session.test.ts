import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ epoch: 3 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => auth.epoch,
  assertSessionEpoch: (epoch: number) => {
    if (epoch !== auth.epoch) throw new DOMException("Changed", "AbortError");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  createCommunitySession,
  communitySessionKeys,
  communityIdentityKey,
} from "./community-session";
const date = "2026-11-02T00:00:00Z";
const detail = {
  dynamicId: 11,
  author: { userId: 7, nickname: "snow", avatarUrl: null },
  summary: "snow",
  coverUrl: null,
  imageCount: 0,
  resort: null,
  likeCount: 1,
  commentCount: 0,
  likedByMe: false,
  status: "published",
  createdAt: date,
  updatedAt: date,
  content: "snow",
  imageUrls: [],
};
const me = {
  userId: 7,
  permissionKeys: [
    "community:like:toggle",
    "community:comment:create",
    "community:dynamic:update-own",
  ],
};
const signal = () => new AbortController().signal;
const mock = vi.mocked(apiRequest);
beforeEach(() => {
  auth.epoch = 3;
  mock.mockReset();
});
describe("community captured session", () => {
  it("binds pre/post identity and detail to one epoch and no-store", async () => {
    mock.mockImplementation(async (path) =>
      path === "/auth/me" ? me : detail,
    );
    expect(await createCommunitySession(7).readDetail(11, signal())).toEqual(
      detail,
    );
    expect(mock.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/dynamics/11",
      "/auth/me",
    ]);
    for (const [, options] of mock.mock.calls)
      expect(options).toMatchObject({
        expectedSessionEpoch: 3,
        cache: "no-store",
      });
  });
  it("does not expose a late read if the account changes after data", async () => {
    mock
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({ ...me, userId: 8 });
    await expect(
      createCommunitySession(7).readDetail(11, signal()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("does not recapture an epoch between verification and the next operation", async () => {
    mock.mockImplementationOnce(async () => {
      auth.epoch++;
      return me;
    });
    await expect(
      createCommunitySession(7).readDetail(11, signal()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mock).toHaveBeenCalledOnce();
  });
  it("rejects old and aborted sessions before sending", async () => {
    const session = createCommunitySession(7);
    auth.epoch++;
    await expect(session.comment(11, "x", signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    const c = new AbortController();
    c.abort();
    await expect(
      createCommunitySession(null).feed("", null, c.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mock).not.toHaveBeenCalled();
  });
  it("guests have false personal likes and cannot write", async () => {
    mock.mockResolvedValue({ ...detail, likedByMe: true });
    const guest = createCommunitySession(null);
    expect((await guest.readDetail(11, signal())).likedByMe).toBe(false);
    mock.mockClear();
    await expect(guest.comment(11, "x", signal())).rejects.toMatchObject({
      status: 401,
    });
    expect(mock).not.toHaveBeenCalled();
  });
  it("rechecks latest like state before choosing an explicit DELETE target", async () => {
    mock.mockImplementation(async (path, options) =>
      path === "/auth/me"
        ? me
        : options?.method === "DELETE"
          ? { liked: false, likeCount: 0 }
          : { ...detail, likedByMe: true },
    );
    const attempted = vi.fn();
    expect(
      await createCommunitySession(7).toggleLike(11, signal(), attempted),
    ).toEqual({ liked: false, likeCount: 0 });
    expect(attempted).toHaveBeenCalledOnce();
    expect(mock.mock.calls.at(-1)).toMatchObject([
      "/dynamics/11/like",
      { method: "DELETE", expectedSessionEpoch: 3 },
    ]);
  });
  it.each(["like", "comment", "delete-dynamic"] as const)(
    "denies missing %s grant without a command",
    async (action) => {
      mock.mockResolvedValue({ ...me, permissionKeys: [] });
      const session = createCommunitySession(7),
        attempted = vi.fn();
      const op =
        action === "like"
          ? session.toggleLike(11, signal(), attempted)
          : action === "comment"
            ? session.comment(11, "x", signal(), attempted)
            : session.remove(11, "dynamic", signal(), attempted);
      await expect(op).rejects.toMatchObject({ status: 403 });
      expect(attempted).not.toHaveBeenCalled();
      expect(mock.mock.calls.every(([path]) => path === "/auth/me")).toBe(true);
    },
  );
  it("does not issue delete for another author's dynamic", async () => {
    mock.mockImplementation(async (path) =>
      path === "/auth/me"
        ? me
        : { ...detail, author: { ...detail.author, userId: 8 } },
    );
    const attempted = vi.fn();
    await expect(
      createCommunitySession(7).remove(11, "dynamic", signal(), attempted),
    ).rejects.toMatchObject({ status: 403 });
    expect(attempted).not.toHaveBeenCalled();
    expect(mock.mock.calls.some(([, opts]) => opts?.method === "DELETE")).toBe(
      false,
    );
  });
  it("marks the attempt before POST and rejects malformed success for manual review", async () => {
    const attempted = vi.fn();
    mock.mockImplementation(async (path) => {
      if (path === "/auth/me") return me;
      expect(attempted).toHaveBeenCalledOnce();
      return { commentId: -1 };
    });
    await expect(
      createCommunitySession(7).comment(11, " x ", signal(), attempted),
    ).rejects.toThrow("result");
    expect(mock.mock.calls.at(-1)).toMatchObject([
      "/dynamics/11/comments",
      { body: { content: "x" }, method: "POST" },
    ]);
  });
  it("keeps account/epoch keys and grant identities distinct with stable grant ordering", () => {
    expect(communitySessionKeys.comments(11, 7, 3)).not.toEqual(
      communitySessionKeys.comments(11, 8, 3),
    );
    expect(communitySessionKeys.feed(7, 3, "x")).not.toEqual(
      communitySessionKeys.feed(7, 4, "x"),
    );
    const u = { userId: 7, account: "snow", permissionKeys: ["a", "b"] };
    expect(communityIdentityKey(u, 3)).toBe(
      communityIdentityKey({ ...u, permissionKeys: ["b", "a"] }, 3),
    );
    expect(communityIdentityKey(u, 3)).not.toBe(communityIdentityKey(u, 4));
    expect(communityIdentityKey(u, 3)).not.toBe(
      communityIdentityKey({ ...u, permissionKeys: ["a"] }, 3),
    );
  });
  it("rejects a repeated feed cursor and unexpected comment pages", async () => {
    mock.mockResolvedValue({ items: [], nextCursor: "same", hasNext: true });
    await expect(
      createCommunitySession(null).feed("", "same", signal()),
    ).rejects.toThrow("cursor");
    mock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNext: false,
    });
    await expect(
      createCommunitySession(null).comments(11, 2, signal()),
    ).rejects.toThrow("comments");
  });
});
