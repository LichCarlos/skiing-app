import { createThemedStyles } from "../../theme";

// These screens also render when the normal theme and session providers fail.
export const useRouteFallbackStyles = createThemedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
    gap: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 26,
    textAlign: "center",
    maxWidth: 520,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 48,
    minWidth: 160,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
}));
