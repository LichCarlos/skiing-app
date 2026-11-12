import { palette } from "../src/theme";
const colors = (value: typeof palette.light | typeof palette.dark) => ({
  text: value.text,
  background: value.background,
  tint: value.primary,
  tabIconDefault: value.muted,
  tabIconSelected: value.primary,
});
export default { light: colors(palette.light), dark: colors(palette.dark) };
