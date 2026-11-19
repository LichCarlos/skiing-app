import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  os: "android",
  props: {} as Record<string, unknown>,
}));
vi.mock("react-native", () => ({
  Platform: { get OS() { return native.os; } },
  Pressable: (props: Record<string, unknown>) => {
    native.props = props;
    return createElement("button", null, props.children as ReactNode);
  },
}));
vi.mock("../../theme", () => ({
  radius: { lg: 16 },
  useAppColors: () => ({ pressed: "#D9E8FF" }),
}));
import { RoundedTabButton } from "./rounded-tab-button";

beforeEach(() => {
  native.os = "android";
  native.props = {};
});

describe("rounded tab navigation event integration (native component substituted)", () => {
  it("keeps native navigation, long press, selected state and refs", () => {
    const press = vi.fn(), longPress = vi.fn(), ref = vi.fn();
    renderToStaticMarkup(
      <RoundedTabButton onPress={press} onLongPress={longPress} ref={ref} aria-selected>
        雪场
      </RoundedTabButton>,
    );
    const event = { nativeEvent: {} };
    (native.props.onPress as (event: unknown) => void)(event);
    expect(press).toHaveBeenCalledWith(event);
    expect(native.props.onLongPress).toBe(longPress);
    expect(native.props["aria-selected"]).toBe(true);
    const instance = {};
    (native.props.ref as (instance: unknown) => void)(instance);
    expect(ref).toHaveBeenCalledWith(instance);
  });

  it("lets Web modifier clicks open the link without navigating the current tab", () => {
    native.os = "web";
    const press = vi.fn(), preventDefault = vi.fn();
    renderToStaticMarkup(<RoundedTabButton href="/resorts" onPress={press}>雪场</RoundedTabButton>);
    const onPress = native.props.onPress as (event: unknown) => void;
    onPress({ nativeEvent: { ctrlKey: true, button: 0 }, preventDefault });
    expect(press).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    const ordinaryClick = { nativeEvent: { button: 0 }, preventDefault };
    onPress(ordinaryClick);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(press).toHaveBeenCalledWith(ordinaryClick);
    expect(native.props.href).toBe("/resorts");
  });
});
