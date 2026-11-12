import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
type NativeConfig = {
  android?: { package?: string };
  ios?: { bundleIdentifier?: string };
  owner?: string;
  extra?: { eas?: { projectId?: string } };
  _internal?: {
    modResults?: {
      android?: {
        manifest?: {
          manifest?: { application?: { $?: Record<string, string> }[] };
        };
      };
      ios?: { infoPlist?: Record<string, unknown> };
    };
  };
};

export function verifyNativeConfig(config: NativeConfig) {
  if (
    !config.android?.package ||
    !config.ios?.bundleIdentifier ||
    !config.owner ||
    !config.extra?.eas?.projectId
  ) {
    throw new Error("Native release identity is incomplete");
  }
  const application =
    config._internal?.modResults?.android?.manifest?.manifest?.application?.[0]
      ?.$;
  if (
    application?.["android:fullBackupContent"] !==
      "@xml/secure_store_backup_rules" ||
    application?.["android:dataExtractionRules"] !==
      "@xml/secure_store_data_extraction_rules"
  ) {
    throw new Error("SecureStore Android backup exclusion is not configured");
  }
  const infoPlist = config._internal?.modResults?.ios?.infoPlist;
  if (!infoPlist || infoPlist.NSFaceIDUsageDescription !== undefined) {
    throw new Error(
      "Unexpected Face ID permission for the current password-only session",
    );
  }
  const secureStore = path.dirname(
    require.resolve("expo-secure-store/package.json"),
  );
  for (const file of [
    "secure_store_backup_rules.xml",
    "secure_store_data_extraction_rules.xml",
  ]) {
    const xml = readFileSync(
      path.join(secureStore, "android/src/main/res/xml", file),
      "utf8",
    );
    if (!xml.includes('<exclude domain="sharedpref" path="SecureStore"/>')) {
      throw new Error(
        "Installed SecureStore backup resource is missing its exclusion",
      );
    }
  }
  const contract = readFileSync(path.join(root, "contracts/openapi.json"));
  const lock = JSON.parse(
    readFileSync(path.join(root, "contracts/openapi.lock.json"), "utf8"),
  ) as { version: string; sha256: string };
  if (createHash("sha256").update(contract).digest("hex") !== lock.sha256)
    throw new Error("OpenAPI lock mismatch");
  return {
    androidPackage: config.android.package,
    iosBundleIdentifier: config.ios.bundleIdentifier,
    owner: config.owner,
    projectId: config.extra.eas.projectId,
    openapi: lock,
    backupExclusion: true,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!["preview", "production"].includes(process.env.LINJI_APP_ENV ?? ""))
    throw new Error(
      "Set LINJI_APP_ENV=preview or production before release:check",
    );
  const expoPackage = path.dirname(require.resolve("expo/package.json"));
  const output = execFileSync(
    process.execPath,
    [
      path.join(expoPackage, "bin/cli"),
      "config",
      "--type",
      "introspect",
      "--json",
    ],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  console.log(
    JSON.stringify(verifyNativeConfig(JSON.parse(output) as NativeConfig)),
  );
}
