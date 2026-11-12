import { useState } from "react";
import {
  ActivityIndicator as NativeActivityIndicator,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  type PressableProps,
} from "react-native";
import type { ComponentProps } from "react";
import { radius, useAppColors } from "../theme";
import { controlFeedback } from "./control-feedback";

export function ActivityIndicator(
  props: ComponentProps<typeof NativeActivityIndicator>,
) {
  const colors = useAppColors();
  return <NativeActivityIndicator color={colors.primary} {...props} />;
}

/** Keeps native events/refs and caller layout while sharing touch and input states. */
export function Pressable({
  style,
  disabled,
  accessibilityRole = "button",
  accessibilityState,
  android_ripple,
  onFocus,
  onBlur,
  ...props
}: PressableProps) {
  const colors = useAppColors();
  const [focused, setFocused] = useState(false);
  return (
    <NativePressable
      {...props}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        disabled: !!disabled || accessibilityState?.disabled,
      }}
      android_ripple={
        android_ripple ?? { color: colors.pressed, borderless: false }
      }
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        { minHeight: 44, justifyContent: "center" },
        typeof style === "function" ? style(state) : style,
        controlFeedback({
          disabled: !!disabled,
          pressed: state.pressed,
          focused,
          focusColor: colors.primary,
        }),
      ]}
    />
  );
}

export function TextInput({
  style,
  onFocus,
  onBlur,
  placeholderTextColor,
  ref,
  ...props
}: ComponentProps<typeof NativeTextInput>) {
  const colors = useAppColors();
  const [focused, setFocused] = useState(false);
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? colors.muted}
      selectionColor={colors.primary}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        {
          minHeight: 48,
          borderRadius: radius.md,
          borderCurve: "continuous",
          fontSize: 16,
          color: colors.text,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: colors.inputBorder,
        },
        style,
        focused && {
          borderColor: colors.primary,
          outlineColor: colors.primary,
          outlineWidth: 2,
          outlineOffset: 2,
        },
        props.editable === false && { opacity: 0.6 },
      ]}
    />
  );
}
