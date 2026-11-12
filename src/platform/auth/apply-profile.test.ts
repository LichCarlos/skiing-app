import { describe, expect, it } from "vitest";
import { mergeOwnProfile } from "./apply-profile";
import type { components } from "../api/openapi";
describe("Apply own profile without changing authorization", () => {
  const user: components["schemas"]["CurrentUserVO"] = {
    userId: 1,
    account: "snow",
    nickname: "Old",
    avatarUrl: null,
    roles: [],
    permissionKeys: [],
    menuTree: [],
    merchant: null,
  };
  it("merges only nickname/avatar into the current account", () => {
    const next = mergeOwnProfile(user, {
      userId: 1,
      nickname: "New",
      avatarUrl: "signed",
    });
    expect(next).toEqual({ ...user, nickname: "New", avatarUrl: "signed" });
    expect(next?.roles).toBe(user.roles);
    expect(next?.permissionKeys).toBe(user.permissionKeys);
  });
  it("ignores stale responses after signout or a different account login", () => {
    const profile = { userId: 2, nickname: "Other", avatarUrl: null };
    expect(mergeOwnProfile(user, profile)).toBe(user);
    expect(mergeOwnProfile(null, profile)).toBeNull();
  });
});
