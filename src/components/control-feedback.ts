import type { ViewStyle } from "react-native";

/** Immediate native feedback: no translation, timer, JS animation or layout shift. */
export function controlFeedback({
  disabled,
  pressed,
  focused,
  focusColor,
}: {
  disabled: boolean;
  pressed: boolean;
  focused: boolean;
  focusColor: string;
}): ViewStyle {
  return {
    ...(disabled ? { opacity: 0.48 } : pressed ? { opacity: 0.86 } : {}),
    ...(focused && !disabled
      ? { outlineColor: focusColor, outlineWidth: 2, outlineOffset: 3 }
      : {}),
  };
}
