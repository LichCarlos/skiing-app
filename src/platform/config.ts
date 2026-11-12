const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export function getApiBaseUrl(): string {
  if (!apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
  }

  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new TypeError(
      "EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL",
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError(
      "EXPO_PUBLIC_API_BASE_URL must not contain credentials, a query, or a fragment",
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}
