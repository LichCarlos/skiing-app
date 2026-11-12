import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  TextInput: () => null,
  Pressable: (props: Record<string, unknown>) => {
    captured.props = props;
    return createElement(
      "button",
      { disabled: props.disabled as boolean },
      props.children as ReactNode,
    );
  },
}));
vi.mock("../theme", () => ({
  radius: { md: 12 },
  useAppColors: () => ({ primary: "#2455F5", pressed: "#D9E8FF" }),
}));
import { Pressable } from "./controls";

beforeEach(() => {
  captured.props = {};
});
describe("native Pressable integration with static Native substitute", () => {
  it("preserves event, accessibility, style and caller ripple configuration", () => {
    const press = vi.fn();
    const ripple = { color: "red", borderless: true };
    renderToStaticMarkup(
      <Pressable
        onPress={press}
        android_ripple={ripple}
        accessibilityState={{ selected: true }}
        style={{ opacity: 0.7, transform: [{ scale: 0.9 }] }}
      >
        收藏
      </Pressable>,
    );
    expect(captured.props.onPress).toBe(press);
    expect(captured.props.android_ripple).toEqual(ripple);
    expect(captured.props.accessibilityState).toEqual({
      selected: true,
      disabled: undefined,
    });
    const style = captured.props.style as (state: {
      pressed: boolean;
    }) => unknown[];
    expect(style({ pressed: false })).toEqual([
      { minHeight: 44, justifyContent: "center" },
      { opacity: 0.7, transform: [{ scale: 0.9 }] },
      {},
    ]);
    expect(style({ pressed: true }).at(-1)).toEqual({ opacity: 0.86 });
  });
  it("passes disabled and the default native ripple without adding an animated wrapper", () => {
    const html = renderToStaticMarkup(<Pressable disabled>提交</Pressable>);
    expect(html).toContain("disabled");
    expect(captured.props.android_ripple).toEqual({
      color: "#D9E8FF",
      borderless: false,
    });
    const style = captured.props.style as (state: {
      pressed: boolean;
    }) => unknown[];
    expect(style({ pressed: true }).at(-1)).toEqual({ opacity: 0.48 });
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
