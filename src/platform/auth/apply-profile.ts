import type { components } from "../api/openapi";

type CurrentUser = components["schemas"]["CurrentUserVO"];
type Profile = Pick<
  components["schemas"]["UserProfileVO"],
  "userId" | "nickname" | "avatarUrl"
>;

export function mergeOwnProfile(
  user: CurrentUser | null,
  profile: Profile,
): CurrentUser | null {
  return user?.userId === profile.userId
    ? { ...user, nickname: profile.nickname, avatarUrl: profile.avatarUrl }
    : user;
}
