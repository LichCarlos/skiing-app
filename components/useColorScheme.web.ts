import { useSyncExternalStore } from "react";
function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const snapshot = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
// Match SSR markup first, then follow the browser appearance after hydration.
export function useColorScheme() {
  return useSyncExternalStore(subscribe, snapshot, () => "light" as const);
}
