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
    background: "#EEF7FF",
    surface: "#FFFFFF",
    text: "#17264C",
    muted: "#495E80",
    border: "#CBD9EF",
    inputBorder: "#7B91B5",
    primary: "#2455F5",
    primaryText: "#FFFFFF",
    accent: "#DC2F43",
    accentText: "#FFFFFF",
    accentSurface: "#FFE1E4",
    highlight: "#EFFF46",
    highlightText: "#17264C",
    warm: "#FF9A3C",
    warmText: "#17264C",
    navigation: "#2455F5",
    error: "#AC322D",
    success: "#176B4D",
    segment: "#E5EFFF",
    soft: "#F5FFC2",
    pressed: "#D9E8FF",
    onImage: "#FFFFFF",
  },
  dark: {
    background: "#0F1E2B",
    surface: "#192F40",
    text: "#EEF7FD",
    muted: "#ADC7DA",
    border: "#37566F",
    inputBorder: "#7E9EB8",
    primary: "#92B5FF",
    primaryText: "#102D43",
    accent: "#FF9CA8",
    accentText: "#17264C",
    accentSurface: "#432A39",
    highlight: "#EFFF46",
    highlightText: "#17264C",
    warm: "#FFAC60",
    warmText: "#17264C",
    navigation: "#2455F5",
    error: "#FFA69C",
    success: "#8DD7B4",
    segment: "#203E54",
    soft: "#203E54",
    pressed: "#2D536D",
    onImage: "#FFFFFF",
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
export const typography = {
  title: { fontSize: 28, lineHeight: 38, fontWeight: "700" },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: "700" },
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
