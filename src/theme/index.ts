import { useMemo } from "react";
import {
  StyleSheet,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { useColorScheme } from "../../components/useColorScheme";

export const palette = {
  light: {
    background: "#F4E9E1",
    surface: "#F4E9E1",
    text: "#000000",
    muted: "#574C45",
    border: "#000000",
    inputBorder: "#000000",
    primary: "#2455F5",
    primaryText: "#FFFFFF",
    accent: "#DC2F43",
    accentText: "#FFFFFF",
    accentSurface: "#FFE1E4",
    highlight: "#FFDA3D",
    highlightText: "#000000",
    warm: "#FF7A24",
    warmText: "#000000",
    navigation: "#FFDA3D",
    error: "#AC322D",
    success: "#176B4D",
    segment: "#E9DACF",
    soft: "#FFE6AA",
    pressed: "#D9E8FF",
    onImage: "#FFFFFF",
    shadow: "#000000",
  },
  dark: {
    background: "#201D1B",
    surface: "#2D2825",
    text: "#F4E9E1",
    muted: "#D0BFB3",
    border: "#F4E9E1",
    inputBorder: "#D0BFB3",
    primary: "#92B5FF",
    primaryText: "#102D43",
    accent: "#FF9CA8",
    accentText: "#17264C",
    accentSurface: "#432A39",
    highlight: "#FFDA3D",
    highlightText: "#000000",
    warm: "#FF9A58",
    warmText: "#000000",
    navigation: "#2D2825",
    error: "#FFA69C",
    success: "#8DD7B4",
    segment: "#203E54",
    soft: "#203E54",
    pressed: "#2D536D",
    onImage: "#FFFFFF",
    shadow: "#000000",
  },
} as const;
export type AppColors = { [K in keyof typeof palette.light]: string };
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  pageBottom: 48,
} as const;
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;
export function brutalFrame(colors: AppColors, raised = false): ViewStyle {
  return {
    borderWidth: 2,
    borderColor: colors.border,
    ...(raised
      ? { boxShadow: [{ offsetX: 3, offsetY: 3, blurRadius: 0, color: colors.shadow }] }
      : {}),
  };
}
export const typography = {
  title: { fontSize: 28, lineHeight: 38, fontWeight: "800" },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 26 },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  caption: { fontSize: 13, lineHeight: 20 },
} as const satisfies Record<string, TextStyle>;

export function useAppColors(): AppColors {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

// Each screen gets a memoized StyleSheet; switching appearance updates every surface.
export function createThemedStyles<
  T extends Record<string, ViewStyle | TextStyle | ImageStyle>,
>(factory: (colors: AppColors) => T) {
  return function useThemedStyles(): T {
    const colors = useAppColors();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
