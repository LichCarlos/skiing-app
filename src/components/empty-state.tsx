import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "../../components/Themed";
import { createThemedStyles, typography } from "../theme";

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {children}
    </View>
  );
}
const useStyles = createThemedStyles((colors) => ({
  container: {
    minHeight: 240,
    padding: 24,
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { ...typography.heading, color: colors.text, textAlign: "center" },
  message: {
    ...typography.body,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 360,
  },
}));
