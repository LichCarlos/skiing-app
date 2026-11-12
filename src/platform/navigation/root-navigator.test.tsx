import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ status: "restoring" }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("../auth/session-provider", () => ({
  useAuthSession: () => ({ status: model.status }),
}));
vi.mock("../auth/secure-session", () => ({
  subscribeSessionChange: vi.fn(() => () => {}),
}));
vi.mock("../../../components/useColorScheme", () => ({
  useColorScheme: () => "light",
}));
vi.mock("expo-splash-screen", () => ({ hideAsync: vi.fn() }));
vi.mock("expo-router", () => {
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) =>
      createElement("nav", { "aria-label": "app-routes" }, children),
    {
      Screen: ({ name }: { name: string }) => createElement("span", null, name),
    },
  );
  return {
    Stack,
    DarkTheme: {},
    DefaultTheme: {},
    ThemeProvider: ({ children }: { children?: ReactNode }) => children,
  };
});
import { RootNavigator } from "./root-navigator";
beforeEach(() => {
  model.status = "restoring";
});
describe("root navigator availability (native navigation mocked)", () => {
  it("keeps public and auth routes mounted while startup restore is pending", () => {
    const html = renderToStaticMarkup(createElement(RootNavigator));
    expect(html).toContain("app-routes");
    expect(html).toContain("auth");
  });
  it.each(["anonymous", "authenticated"])(
    "mounts the same route tree for %s",
    (status) => {
      model.status = status;
      const html = renderToStaticMarkup(createElement(RootNavigator));
      expect(html).toContain("app-routes");
      expect(html).toContain("(tabs)");
    },
  );
});
