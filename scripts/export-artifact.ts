import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = "linji-export-manifest.json";
const verifierName = "verify-export.ts";
type FileEntry = { path: string; bytes: number; sha256: string };
type Manifest = {
  formatVersion: 1;
  artifactKind: "expo-bundle-export";
  createdAt: string;
  source: {
    packageName: string;
    expoVersion: string;
    nodeVersion: string;
    lockfileSha256: string;
    openapiVersion: string;
    openapiSha256: string;
  };
  webOutput: "server";
  nativeInstallable: false;
  files: FileEntry[];
  contentSha256: string;
};
function fail(message: string): never {
  throw new Error(message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Expected object");
  return value as Record<string, unknown>;
}
function json(file: string) {
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
    fail("JSON metadata must be a regular file");
  return object(JSON.parse(readFileSync(file, "utf8")));
}
function hash(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length)
    fail("Expected nonempty text");
  return value;
}
function digest(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result)) fail("Invalid SHA-256");
  return result;
}
function relative(value: unknown, windowsMetadata = false): string {
  const input = text(value),
    result = windowsMetadata ? input.replaceAll("\\", "/") : input;
  if (
    result.includes("\\") ||
    result.startsWith("/") ||
    result
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p.includes(":") ||
          Array.from(p).some(
            (character) => (character.codePointAt(0) ?? 0) < 32,
          ),
      )
  )
    fail("Unsafe artifact path");
  return result;
}
function rootPath(input: string | undefined) {
  if (!input || !path.isAbsolute(input))
    fail("An absolute export directory is required");
  const absolute = path.resolve(input);
  if (
    lstatSync(absolute).isSymbolicLink() ||
    !lstatSync(absolute).isDirectory()
  )
    fail("Export directory must be a real directory");
  const real = realpathSync(absolute),
    normalized = (p: string) =>
      process.platform === "win32" ? p.toLowerCase() : p;
  if (normalized(real) !== normalized(absolute))
    fail("Export directory must not traverse links");
  return real;
}
function inventory(root: string): FileEntry[] {
  const result: FileEntry[] = [],
    pending = [""];
  while (pending.length) {
    const folder = pending.pop()!;
    for (const name of readdirSync(path.join(root, folder))) {
      const key = relative(folder ? `${folder}/${name}` : name),
        file = path.join(root, key),
        stat = lstatSync(file);
      if (stat.isSymbolicLink())
        fail("Links are not allowed in export artifacts");
      if (name === ".git" || key === "node_modules" || name.startsWith(".env"))
        fail("Source/dependency/environment files are not export artifacts");
      if (stat.isDirectory()) pending.push(key);
      else {
        if (!stat.isFile()) fail("Special files are not export artifacts");
        if (key !== manifestName) {
          const bytes = readFileSync(file);
          result.push({ path: key, bytes: bytes.length, sha256: hash(bytes) });
        }
      }
    }
  }
  return result.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}
function references(root: string, files: FileEntry[]) {
  const names = new Map(files.map((file) => [file.path, file]));
  const required = (name: string) => {
    if (!names.get(name)?.bytes)
      fail(`Missing or empty referenced export: ${name}`);
  };
  required("metadata.json");
  const metadata = json(path.join(root, "metadata.json"));
  if (metadata.version !== 0 || metadata.bundler !== "metro")
    fail("Unsupported Expo metadata format");
  const platforms = object(metadata.fileMetadata);
  for (const platform of ["ios", "android"]) {
    const value = object(platforms[platform]),
      bundle = relative(value.bundle, true);
    if (!bundle.startsWith(`_expo/static/js/${platform}/`))
      fail("Native bundle belongs to another platform");
    required(bundle);
    if (!Array.isArray(value.assets)) fail("Missing native asset list");
    for (const asset of value.assets)
      required(relative(object(asset).path, true));
  }
  required("server/_expo/routes.json");
  const routes = json(path.join(root, "server/_expo/routes.json")),
    rendering = object(routes.rendering);
  if (rendering.mode !== "ssr")
    fail("This artifact format requires Expo server output");
  required(`server/${relative(rendering.file)}`);
  const webAsset = (value: unknown) => {
    const url = text(value);
    if (!url.startsWith("/") || url.startsWith("//"))
      fail("Unsafe web asset URL");
    required(`client/${relative(url.slice(1))}`);
  };
  const assets = (value: unknown) => {
    const record = object(value);
    for (const kind of ["js", "css"]) {
      if (!Array.isArray(record[kind])) fail("Missing route asset list");
      for (const asset of record[kind]) {
        if (kind === "css" && typeof asset !== "string") {
          const stylesheet = object(asset);
          if (stylesheet.type !== "css") fail("Unsupported CSS asset type");
          webAsset(stylesheet.href);
        } else webAsset(asset);
      }
    }
  };
  assets(routes.assets);
  if (object(routes.assets).favicon !== undefined)
    webAsset(object(routes.assets).favicon);
  if (
    !Array.isArray(routes.htmlRoutes) ||
    !routes.htmlRoutes.length ||
    !Array.isArray(routes.apiRoutes) ||
    routes.apiRoutes.length
  )
    fail("Unsupported or missing web routes");
  for (const route of routes.htmlRoutes) assets(object(route).assets);
}
function readManifest(root: string): Manifest {
  const value = json(path.join(root, manifestName)),
    source = object(value.source);
  if (
    value.formatVersion !== 1 ||
    value.artifactKind !== "expo-bundle-export" ||
    value.webOutput !== "server" ||
    value.nativeInstallable !== false ||
    !Number.isFinite(Date.parse(text(value.createdAt))) ||
    !Array.isArray(value.files)
  )
    fail("Unsupported artifact manifest");
  text(source.packageName);
  text(source.nodeVersion);
  text(source.openapiVersion);
  if (!text(source.expoVersion).startsWith("58.")) fail("Unsupported Expo SDK");
  digest(source.lockfileSha256);
  digest(source.openapiSha256);
  let previous = "";
  for (const entry of value.files) {
    const file = object(entry),
      name = relative(file.path);
    if (
      name === manifestName ||
      name <= previous ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0
    )
      fail("Invalid or duplicate inventory entry");
    digest(file.sha256);
    previous = name;
  }
  if (hash(JSON.stringify(value.files)) !== digest(value.contentSha256))
    fail("Inventory digest mismatch");
  return value as unknown as Manifest;
}
function seal(root: string) {
  if (
    existsSync(path.join(root, manifestName)) ||
    existsSync(path.join(root, verifierName))
  )
    fail("Export is already sealed or contains a verifier; refusing overwrite");
  const before = inventory(root);
  references(root, before);
  const repo = fileURLToPath(new URL("../", import.meta.url)),
    pkg = json(path.join(repo, "package.json")),
    expo = json(path.join(repo, "node_modules/expo/package.json"));
  if (!text(expo.version).startsWith("58.")) fail("Unsupported Expo SDK");
  const contractBytes = readFileSync(path.join(repo, "contracts/openapi.json")),
    contract = object(JSON.parse(contractBytes.toString("utf8"))),
    lock = json(path.join(repo, "contracts/openapi.lock.json"));
  const openapiVersion = text(object(contract.info).version),
    openapiSha256 = hash(contractBytes);
  if (lock.version !== openapiVersion || lock.sha256 !== openapiSha256)
    fail("OpenAPI lock mismatch");
  const source = {
    packageName: text(pkg.name),
    expoVersion: text(expo.version),
    nodeVersion: process.version,
    lockfileSha256: hash(readFileSync(path.join(repo, "pnpm-lock.yaml"))),
    openapiVersion,
    openapiSha256,
  };
  const verifier = path.join(root, verifierName);
  writeFileSync(verifier, readFileSync(fileURLToPath(import.meta.url)), {
    flag: "wx",
  });
  try {
    const files = inventory(root);
    const manifest: Manifest = {
      formatVersion: 1,
      artifactKind: "expo-bundle-export",
      createdAt: new Date().toISOString(),
      source,
      webOutput: "server",
      nativeInstallable: false,
      files,
      contentSha256: hash(JSON.stringify(files)),
    };
    writeFileSync(
      path.join(root, manifestName),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    unlinkSync(verifier);
    throw error;
  }
}
function verify(root: string, expectedContract?: string) {
  const value = readManifest(root),
    files = inventory(root);
  if (
    expectedContract !== undefined &&
    value.source.openapiSha256 !== digest(expectedContract)
  )
    fail("Unexpected OpenAPI contract");
  if (
    !files.some((file) => file.path === verifierName) ||
    JSON.stringify(files) !== JSON.stringify(value.files)
  )
    fail("Artifact inventory mismatch (changed, missing or extra file)");
  references(root, files);
  return {
    artifactKind: value.artifactKind,
    files: files.length,
    contentSha256: value.contentSha256,
    openapiVersion: value.source.openapiVersion,
    openapiSha256: value.source.openapiSha256,
    nativeInstallable: false,
  };
}
try {
  const [command, input, expectedContract, ...rest] = process.argv.slice(2);
  if (
    !command ||
    !["seal", "verify"].includes(command) ||
    rest.length ||
    (command === "seal" && expectedContract !== undefined)
  )
    fail(
      "Usage: export-artifact.ts seal|verify ABSOLUTE_DIRECTORY [EXPECTED_OPENAPI_SHA256]",
    );
  const root = rootPath(input);
  if (command === "seal") seal(root);
  console.info(JSON.stringify(verify(root, expectedContract)));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Artifact verification failed",
  );
  process.exitCode = 1;
}
