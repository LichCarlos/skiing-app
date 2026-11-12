import {
  readFileSync,
  realpathSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigContext } from "expo/config";
import appConfig from "../app.config";
import { verifyNativeConfig } from "./verify-native-release";

const root = fileURLToPath(new URL("../", import.meta.url));
const staticConfig = JSON.parse(
  readFileSync(path.join(root, "app.json"), "utf8"),
) as { expo: ConfigContext["config"] };
const context: ConfigContext = {
  config: staticConfig.expo,
  projectRoot: root,
  staticConfigPath: path.join(root, "app.json"),
  packageJsonPath: path.join(root, "package.json"),
};
const environment = {
  LINJI_APP_ENV: "production",
  LINJI_ANDROID_PACKAGE: "com.linji.fixture",
  LINJI_IOS_BUNDLE_IDENTIFIER: "com.linji.fixture",
  LINJI_EAS_PROJECT_ID: "b258146a-f734-4d62-96cf-66b7abb70123",
  LINJI_EXPO_OWNER: "linji_fixture",
  EXPO_PUBLIC_API_BASE_URL: "https://api.linji.example/api/v1",
};
function releaseEnvironment(mode = "production") {
  for (const [key, value] of Object.entries(environment))
    vi.stubEnv(key, value);
  vi.stubEnv("LINJI_APP_ENV", mode);
}
function manifest() {
  const config = appConfig(context);
  return {
    ...config,
    _internal: {
      modResults: {
        android: {
          manifest: {
            manifest: {
              application: [
                {
                  $: {
                    "android:fullBackupContent":
                      "@xml/secure_store_backup_rules",
                    "android:dataExtractionRules":
                      "@xml/secure_store_data_extraction_rules",
                  },
                },
              ],
            },
          },
        },
        ios: {
          infoPlist: { CFBundleName: "凛迹雪客" } as Record<string, unknown>,
        },
      },
    },
  };
}

describe("Independent native release configuration", () => {
  beforeEach(() => {
    for (const key of Object.keys(environment)) vi.stubEnv(key, undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("preserves local Expo Go configuration and local HTTP without fabricating a project identity", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:8080/api/v1");
    const config = appConfig(context);
    expect(config.slug).toBe("linji-snow");
    expect(config.scheme).toBe("linjisnow");
    expect(config.ios?.bundleIdentifier).toBeUndefined();
    expect(config.android?.package).toBeUndefined();
    expect(config.extra?.eas).toBeUndefined();
    expect(config.plugins).toEqual(staticConfig.expo.plugins);
  });

  it.each(["preview", "production"])(
    "binds explicit %s identity and preserves native/plugin configuration",
    (mode) => {
      releaseEnvironment(mode);
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-not-serialized");
      const config = appConfig(context);
      expect(config.android?.package).toBe(environment.LINJI_ANDROID_PACKAGE);
      expect(config.ios?.bundleIdentifier).toBe(
        environment.LINJI_IOS_BUNDLE_IDENTIFIER,
      );
      expect(config.owner).toBe(environment.LINJI_EXPO_OWNER);
      expect(config.extra?.eas.projectId).toBe(
        environment.LINJI_EAS_PROJECT_ID,
      );
      expect(config.ios?.supportsTablet).toBe(true);
      expect(config.android?.adaptiveIcon).toEqual(
        staticConfig.expo.android?.adaptiveIcon,
      );
      expect(config.plugins).toContainEqual([
        "expo-secure-store",
        { configureAndroidBackup: true, faceIDPermission: false },
      ]);
      expect(JSON.stringify(config)).not.toContain("fixture-not-serialized");
      expect(verifyNativeConfig(manifest()).backupExclusion).toBe(true);
    },
  );

  it.each(Object.keys(environment).filter((key) => key !== "LINJI_APP_ENV"))(
    "rejects missing %s for releases",
    (key) => {
      releaseEnvironment();
      vi.stubEnv(key, undefined);
      expect(() => appConfig(context)).toThrow(key);
    },
  );

  it.each([
    ["LINJI_ANDROID_PACKAGE", "one-segment"],
    ["LINJI_ANDROID_PACKAGE", "com.9invalid"],
    ["LINJI_IOS_BUNDLE_IDENTIFIER", "com.invalid/id"],
    ["LINJI_EAS_PROJECT_ID", "not-a-project-id"],
    ["LINJI_EXPO_OWNER", "owner with spaces"],
    ["LINJI_ANDROID_PACKAGE", "   "],
    ["LINJI_APP_ENV", "prodution"],
  ])("rejects invalid %s without exposing the supplied value", (key, value) => {
    releaseEnvironment();
    vi.stubEnv(key, value);
    expect(() => appConfig(context)).toThrow(key);
    try {
      appConfig(context);
    } catch (error) {
      expect((error as Error).message).not.toContain(value);
    }
  });

  it.each([
    "http://api.linji.example/api/v1",
    "https://localhost/api/v1",
    "https://127.0.0.1/api/v1",
    "https://0x7f000001/api/v1",
    "https://[::1]/api/v1",
    "https://username:password@api.linji.example/api/v1",
    "https://api.linji.example/api/v1?secret=value",
    "https://api.linji.example/api/v1#fragment",
    "not-a-url",
  ])("rejects an unsuitable native release endpoint: %s", (url) => {
    releaseEnvironment();
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", url);
    expect(() => appConfig(context)).toThrow("EXPO_PUBLIC_API_BASE_URL");
  });

  it.each(["android:fullBackupContent", "android:dataExtractionRules"])(
    "rejects missing or conflicting native %s",
    (property) => {
      releaseEnvironment();
      const config = manifest();
      const application = config._internal.modResults.android.manifest.manifest
        .application[0]!.$ as Record<string, string>;
      delete application[property];
      expect(() => verifyNativeConfig(config)).toThrow("backup exclusion");
      application[property] = "@xml/unrelated_rules";
      expect(() => verifyNativeConfig(config)).toThrow("backup exclusion");
    },
  );

  it("rejects an unexpected biometric permission in native introspection", () => {
    releaseEnvironment();
    const config = manifest();
    config._internal.modResults.ios.infoPlist.NSFaceIDUsageDescription =
      "unexpected";
    expect(() => verifyNativeConfig(config)).toThrow("Face ID");
  });

  it("rejects a release manifest missing its identity or native results", () => {
    expect(() => verifyNativeConfig({})).toThrow("identity");
    releaseEnvironment();
    expect(() =>
      verifyNativeConfig({ ...appConfig(context), _internal: undefined }),
    ).toThrow("backup exclusion");
  });

  it("checks EAS upload exclusions with Git ignore semantics without uploading", () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "linji-native-ignore-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: temporary });
      writeFileSync(
        path.join(temporary, ".gitignore"),
        readFileSync(path.join(root, ".easignore")),
      );
      const excluded = [
        ".git/config",
        "node_modules/expo/package.json",
        "dist/index.js",
        "dist-old/index.js",
        ".env.production",
        "private.p12",
        "app.ipa",
        "trace.log",
        "native-release-result.json",
        "docs/guide.md",
        "src/example.test.ts",
        "scripts/export-artifact.node-test.ts",
        "scripts/export-source.node-test.ts",
        "test/http.spec.ts",
        "android/gradlew",
        "ios/Podfile",
      ];
      const included = [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "app.json",
        "app.config.ts",
        "eas.json",
        ".easignore",
        ".nvmrc",
        "tsconfig.json",
        "app/_layout.tsx",
        "src/platform/config.ts",
        "assets/images/icon.png",
        "scripts/verify-native-release.ts",
        "contracts/openapi.json",
        "contracts/openapi.lock.json",
      ];
      const paths = [...excluded, ...included];
      const result = spawnSync(
        "git",
        [
          "-c",
          `core.excludesFile=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
          "check-ignore",
          "--no-index",
          "--stdin",
        ],
        { cwd: temporary, input: `${paths.join("\n")}\n`, encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      const ignored = new Set(result.stdout.trim().split(/\r?\n/));
      for (const file of excluded) expect(ignored.has(file), file).toBe(true);
      for (const file of included) expect(ignored.has(file), file).toBe(false);
    } finally {
      const target = realpathSync(temporary);
      expect(path.dirname(target)).toBe(realpathSync(tmpdir()));
      expect(path.basename(target).startsWith("linji-native-ignore-")).toBe(
        true,
      );
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("keeps native profiles independent of development clients and OTA services", () => {
    const eas = JSON.parse(
      readFileSync(path.join(root, "eas.json"), "utf8"),
    ) as {
      cli: { appVersionSource: string };
      build: Record<
        string,
        {
          environment: string;
          distribution: string;
          node: string;
          pnpm: string;
          env: { LINJI_APP_ENV: string };
          android: { buildType: string };
          autoIncrement?: boolean;
          developmentClient?: boolean;
        }
      >;
    };
    expect(eas.cli.appVersionSource).toBe("remote");
    for (const name of ["preview", "production"]) {
      const profile = eas.build[name]!;
      expect(profile.environment).toBe(name);
      expect(profile.env.LINJI_APP_ENV).toBe(name);
      expect(profile.node).toBe("22.16.0");
      expect(profile.pnpm).toBe("11.25.0");
      expect(profile.developmentClient).toBeUndefined();
    }
    expect(eas.build.preview?.distribution).toBe("internal");
    expect(eas.build.preview?.android.buildType).toBe("apk");
    expect(eas.build.production?.distribution).toBe("store");
    expect(eas.build.production?.android.buildType).toBe("app-bundle");
    expect(eas.build.production?.autoIncrement).toBe(true);
  });
});
