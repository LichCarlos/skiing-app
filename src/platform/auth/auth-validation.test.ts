import { describe, expect, it } from "vitest";
import {
  normalizeAccount,
  validateLogin,
  validatePasswordChange,
  validateRegistration,
} from "./auth-validation";

describe("auth form validation", () => {
  it("normalizes accounts the same way as the API", () => {
    expect(normalizeAccount("  Snow.Rider  ")).toBe("snow.rider");
  });

  it("validates registration passwords by UTF-8 bytes", () => {
    expect(
      validateRegistration({
        account: "rider",
        password: "雪雪",
        nickname: "雪客",
      }).password,
    ).toBe("密码至少需要 8 个 UTF-8 字节");
    expect(
      validateRegistration({
        account: "rider",
        password: "雪雪雪",
        nickname: "雪客",
      }).password,
    ).toBeUndefined();
    expect(
      validateRegistration({
        account: "rider",
        password: "a".repeat(73),
        nickname: "雪客",
      }).password,
    ).toBe("密码不能超过 72 字节");
  });

  it("uses code-point limits for account and nickname and trims the nickname", () => {
    expect(
      validateRegistration({
        account: "😀".repeat(51),
        password: "snowpass",
        nickname: "雪客",
      }).account,
    ).toBe("账号不能超过 50 个字符");
    expect(
      validateRegistration({
        account: "rider",
        password: "snowpass",
        nickname: "  雪客  ",
      }).nickname,
    ).toBeUndefined();
  });

  it("allows legacy short passwords for login but rejects empty and oversized values", () => {
    expect(validateLogin({ account: "rider", password: "old" })).toEqual({});
    expect(validateLogin({ account: "", password: "" })).toEqual({
      account: "请输入账号",
      password: "请输入密码",
    });
    expect(
      validateLogin({ account: "rider", password: "x".repeat(73) }).password,
    ).toBe("密码不能超过 72 字节");
  });

  it("validates password changes using UTF-8 byte limits and confirmation", () => {
    expect(
      validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "雪雪",
        confirmPassword: "雪雪",
      }).newPassword,
    ).toBe("新密码至少需要 8 个 UTF-8 字节");
    expect(
      validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "snow-pass-2026",
        confirmPassword: "snow-pass-2026",
      }),
    ).toEqual({});
    expect(
      validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "new-pass-2026",
        confirmPassword: "different-pass",
      }).confirmPassword,
    ).toBe("两次输入的新密码不一致");
    expect(
      validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "old-pass",
        confirmPassword: "old-pass",
      }).newPassword,
    ).toBe("新密码必须与当前密码不同");
  });
});
