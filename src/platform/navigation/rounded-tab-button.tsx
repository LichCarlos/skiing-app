import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import type { ComponentRef } from "react";
import { Platform, Pressable } from "react-native";
import { radius, useAppColors } from "../../theme";

/** Round the actual navigation button, including its selected fill and ripple. */
export function RoundedTabButton({
  style,
  android_ripple,
  pressColor,
  pressOpacity = 0.86,
  hoverEffect: _hoverEffect,
  onPress,
  ref,
  ...props
}: BottomTabBarButtonProps) {
  const colors = useAppColors();
  return (
    <Pressable
      {...props}
      ref={(instance: ComponentRef<typeof Pressable> | null) => {
        if (typeof ref === "function") ref(instance);
        else if (ref) ref.current = instance;
      }}
      onPress={(event) => {
        if (Platform.OS === "web" && props.href != null) {
          const native = event.nativeEvent;
          if (
            ("metaKey" in native && native.metaKey) ||
            ("ctrlKey" in native && native.ctrlKey) ||
            ("shiftKey" in native && native.shiftKey) ||
            ("altKey" in native && native.altKey) ||
            ("button" in native && native.button !== 0)
          )
            return;
          event.preventDefault();
        }
        onPress?.(event);
      }}
      android_ripple={{
        ...android_ripple,
        color: pressColor ?? colors.pressed,
        borderless: false,
      }}
      style={({ pressed }) => [
        style,
        {
          borderRadius: radius.lg,
          borderCurve: "continuous",
          overflow: "hidden",
          minHeight: 56,
          justifyContent: "center",
        },
        pressed && { opacity: pressOpacity },
      ]}
    />
  );
}
