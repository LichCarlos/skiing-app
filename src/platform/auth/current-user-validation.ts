import type { components } from "../api/openapi";
type User = components["schemas"]["CurrentUserVO"];
function positiveId(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}
export function assertCurrentUser(value: unknown): asserts value is User {
  const user = value as Partial<User> | null;
  if (
    !user ||
    !positiveId(user.userId) ||
    typeof user.account !== "string" ||
    !user.account.trim() ||
    Array.from(user.account).length > 50 ||
    typeof user.nickname !== "string" ||
    !user.nickname.trim() ||
    Array.from(user.nickname).length > 50 ||
    (user.avatarUrl !== null && typeof user.avatarUrl !== "string") ||
    !Array.isArray(user.permissionKeys) ||
    !user.permissionKeys.every(
      (key) => typeof key === "string" && key.trim(),
    ) ||
    !Array.isArray(user.roles) ||
    !user.roles.every(
      (role) =>
        role &&
        typeof role.roleKey === "string" &&
        role.roleKey.trim() &&
        typeof role.roleName === "string" &&
        role.roleName.trim(),
    ) ||
    !Array.isArray(user.menuTree) ||
    (user.merchant !== null &&
      (!user.merchant ||
        !positiveId(user.merchant.merchantId) ||
        typeof user.merchant.businessName !== "string"))
  )
    throw new TypeError("当前账号资料响应无效");
}
