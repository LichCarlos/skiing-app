import type { ConfigContext, ExpoConfig } from "expo/config";

// Keep this config self-contained: Expo evaluates it before Metro/TS aliases.
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const mode = process.env.LINJI_APP_ENV ?? "development";
  if (!["development", "preview", "production"].includes(mode)) {
    throw new Error("LINJI_APP_ENV must be development, preview or production");
  }
  const release = mode !== "development";
  function value(key: string, pattern?: RegExp): string | undefined {
    const raw = process.env[key];
    const text = raw?.trim();
    if (!text) {
      if (release || raw !== undefined) throw new Error(`${key} is required`);
      return undefined;
    }
    if (pattern && !pattern.test(text)) throw new Error(`${key} is invalid`);
    return text;
  }
  const androidPackage = value(
    "LINJI_ANDROID_PACKAGE",
    /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/,
  );
  const iosBundleIdentifier = value(
    "LINJI_IOS_BUNDLE_IDENTIFIER",
    /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/,
  );
  const projectId = value(
    "LINJI_EAS_PROJECT_ID",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const owner = value("LINJI_EXPO_OWNER", /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
  if (release) {
    let url: URL;
    try {
      url = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
    } catch {
      throw new Error(
        "EXPO_PUBLIC_API_BASE_URL must be an absolute HTTPS URL for native releases",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /^(?:localhost|127(?:\.[0-9]+){3}|\[::1\]|0\.0\.0\.0)$/i.test(
        url.hostname,
      )
    ) {
      throw new Error(
        "EXPO_PUBLIC_API_BASE_URL must be a non-loopback HTTPS URL without credentials, query or fragment for native releases",
      );
    }
  }
  return {
    ...config,
    name: config.name ?? "凛迹雪客",
    slug: config.slug ?? "linji-snow",
    ...(owner ? { owner } : {}),
    ios: {
      ...config.ios,
      ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
    },
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
    },
    ...(projectId
      ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } }
      : {}),
  };
}
