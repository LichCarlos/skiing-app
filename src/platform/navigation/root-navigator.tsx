import { useEffect, useState } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "../../../components/useColorScheme";
import { subscribeSessionChange } from "../auth/secure-session";
import { createAppQueryClient } from "../query/query-client";
import { useAppColors } from "../../theme";

export function RootNavigator() {
  const colorScheme = useColorScheme();
  const colors = useAppColors();
  const [queryClient] = useState(createAppQueryClient);
  useEffect(
    () => subscribeSessionChange(() => queryClient.clear()),
    [queryClient],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...(colorScheme === "dark" ? DarkTheme : DefaultTheme),
          colors: {
            ...(colorScheme === "dark" ? DarkTheme : DefaultTheme).colors,
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
          },
        }}
      >
        <Stack
          screenOptions={{
            statusBarStyle: colorScheme === "dark" ? "light" : "dark",
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
