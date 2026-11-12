import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const script = readFileSync(new URL("./export-artifact.ts", import.meta.url)),
  fixtures: string[] = [],
  parent = realpathSync(tmpdir());
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
function put(root: string, name: string, value: string | Uint8Array) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}
function fixture() {
  const root = mkdtempSync(path.join(parent, "linji-export-artifact-"));
  fixtures.push(root);
  const source = path.join(root, "source"),
    output = path.join(root, "output");
  put(source, "scripts/export-artifact.ts", script);
  put(
    source,
    "package.json",
    JSON.stringify({ name: "@linji/fixture", type: "module" }),
  );
  put(
    source,
    "node_modules/expo/package.json",
    JSON.stringify({ version: "58.0.22" }),
  );
  put(source, "pnpm-lock.yaml", "fixture-lock");
  const contract = JSON.stringify({
      openapi: "3.0.0",
      info: { version: "1.50.2" },
      paths: {},
    }),
    contractHash = hash(contract);
  put(source, "contracts/openapi.json", contract);
  put(
    source,
    "contracts/openapi.lock.json",
    JSON.stringify({ version: "1.50.2", sha256: contractHash }),
  );
  const assets = { js: ["/_expo/static/js/web/entry.js"], css: [] };
  put(
    output,
    "metadata.json",
    JSON.stringify({
      version: 0,
      bundler: "metro",
      fileMetadata: {
        ios: {
          bundle: "_expo/static/js/ios/entry.hbc",
          assets: [{ path: "assets\\image", ext: "png" }],
        },
        android: {
          bundle: "_expo/static/js/android/entry.hbc",
          assets: [{ path: "assets/image", ext: "png" }],
        },
      },
    }),
  );
  put(output, "_expo/static/js/ios/entry.hbc", new Uint8Array([0, 1, 255]));
  put(output, "_expo/static/js/android/entry.hbc", new Uint8Array([255, 2, 0]));
  put(output, "assets/image", new Uint8Array([4, 5, 6]));
  put(
    output,
    "client/assets/node_modules/.pnpm/fixture/node_modules/fonts/font.ttf",
    new Uint8Array([7, 8, 9]),
  );
  put(
    output,
    "server/_expo/routes.json",
    JSON.stringify({
      htmlRoutes: [{ page: "/", assets }],
      apiRoutes: [],
      assets,
      rendering: { mode: "ssr", file: "_expo/server/render.js" },
    }),
  );
  put(
    output,
    "server/_expo/server/render.js",
    "export default function render() {}",
  );
  put(output, "client/_expo/static/js/web/entry.js", "console.log('fixture');");
  return { root, source, output, contractHash };
}
function run(source: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(source, "scripts/export-artifact.ts"),
      ...args,
    ],
    { encoding: "utf8", timeout: 20000 },
  );
}
function rejected(result: ReturnType<typeof run>, pattern: RegExp) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
}
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    assert.equal(path.dirname(root), parent);
    assert(path.basename(root).startsWith("linji-export-artifact-"));
    rmSync(root, { recursive: true, force: true });
  }
});

void test("seals binary exports and verifies after relocation with no source or installed dependencies", () => {
  const f = fixture(),
    sealed = run(f.source, "seal", f.output);
  assert.equal(sealed.status, 0, sealed.stderr);
  const manifest = JSON.parse(
    readFileSync(path.join(f.output, "linji-export-manifest.json"), "utf8"),
  );
  assert.equal(manifest.source.openapiSha256, f.contractHash);
  assert.equal(manifest.nativeInstallable, false);
  assert(
    manifest.files.some(
      (file: { path: string }) => file.path === "verify-export.ts",
    ),
  );
  const relocated = path.join(f.root, "relocated");
  cpSync(f.output, relocated, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(relocated, "verify-export.ts"),
      "verify",
      relocated,
      f.contractHash,
    ],
    { cwd: relocated, encoding: "utf8", timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).openapiVersion, "1.50.2");
  assert.equal(existsSync(path.join(relocated, "node_modules")), false);
  assert.deepEqual(
    readFileSync(
      path.join(
        relocated,
        "client/assets/node_modules/.pnpm/fixture/node_modules/fonts/font.ttf",
      ),
    ),
    Buffer.from([7, 8, 9]),
  );
});
void test("detects changed bytes, removed files and additional unlisted files", () => {
  for (const change of ["modify", "remove", "extra"]) {
    const f = fixture();
    assert.equal(run(f.source, "seal", f.output).status, 0);
    const file = path.join(f.output, "assets/image");
    if (change === "modify") writeFileSync(file, "tampered");
    else if (change === "remove") unlinkSync(file);
    else put(f.output, "extra.js", "extra");
    rejected(run(f.source, "verify", f.output), /inventory mismatch/);
  }
});
void test("checks a trusted expected contract instead of trusting an artifact's own version label", () => {
  const f = fixture();
  assert.equal(run(f.source, "seal", f.output).status, 0);
  rejected(
    run(f.source, "verify", f.output, "0".repeat(64)),
    /Unexpected OpenAPI/,
  );
});
void test("refuses resealing and preserves every existing output byte", () => {
  const f = fixture();
  assert.equal(run(f.source, "seal", f.output).status, 0);
  const file = path.join(f.output, "linji-export-manifest.json"),
    before = readFileSync(file);
  rejected(run(f.source, "seal", f.output), /refusing overwrite/);
  assert.deepEqual(readFileSync(file), before);
});
void test("rejects missing native, SSR and web asset references before writing manifest or verifier", () => {
  for (const file of [
    "_expo/static/js/ios/entry.hbc",
    "server/_expo/server/render.js",
    "client/_expo/static/js/web/entry.js",
  ]) {
    const f = fixture();
    unlinkSync(path.join(f.output, file));
    rejected(run(f.source, "seal", f.output), /Missing or empty referenced/);
    assert(!existsSync(path.join(f.output, "linji-export-manifest.json")));
    assert(!existsSync(path.join(f.output, "verify-export.ts")));
  }
});
void test("rejects metadata traversal and bundles belonging to a different platform", () => {
  for (const bundle of [
    "../outside.hbc",
    "/absolute.hbc",
    "C:\\outside.hbc",
    "_expo/static/js/android/entry.hbc",
  ]) {
    const f = fixture(),
      file = path.join(f.output, "metadata.json"),
      value = JSON.parse(readFileSync(file, "utf8"));
    value.fileMetadata.ios.bundle = bundle;
    writeFileSync(file, JSON.stringify(value));
    rejected(
      run(f.source, "seal", f.output),
      /Unsafe artifact path|another platform/,
    );
  }
});
void test("rejects source, environment and dependency files in an export tree", () => {
  for (const file of [
    ".env.production",
    "node_modules/private.js",
    ".git/config",
  ]) {
    const f = fixture();
    put(f.output, file, "sensitive fixture");
    rejected(run(f.source, "seal", f.output), /not export artifacts/);
    assert(!existsSync(path.join(f.output, "verify-export.ts")));
  }
});
void test("refuses linked export roots and linked files without modifying their targets", () => {
  const f = fixture(),
    outside = path.join(f.root, "outside.txt");
  writeFileSync(outside, "outside");
  symlinkSync(outside, path.join(f.output, "linked.txt"), "file");
  rejected(run(f.source, "seal", f.output), /Links are not allowed/);
  assert.equal(readFileSync(outside, "utf8"), "outside");
  const linked = path.join(f.root, "linked-output");
  symlinkSync(
    f.output,
    linked,
    process.platform === "win32" ? "junction" : "dir",
  );
  rejected(run(f.source, "verify", linked), /real directory|traverse links/);
  const second = fixture();
  assert.equal(run(second.source, "seal", second.output).status, 0);
  const manifest = path.join(second.output, "linji-export-manifest.json");
  unlinkSync(manifest);
  symlinkSync(outside, manifest, "file");
  rejected(run(second.source, "verify", second.output), /regular file/);
  assert.equal(readFileSync(outside, "utf8"), "outside");
});
void test("rejects forged inventories with traversal, duplicate keys, or a damaged digest", () => {
  for (const kind of ["path", "duplicate", "digest"]) {
    const f = fixture();
    assert.equal(run(f.source, "seal", f.output).status, 0);
    const file = path.join(f.output, "linji-export-manifest.json"),
      value = JSON.parse(readFileSync(file, "utf8"));
    if (kind === "path") value.files[0].path = "../outside";
    else if (kind === "duplicate") value.files.push(value.files[0]);
    else value.contentSha256 = "f".repeat(64);
    writeFileSync(file, JSON.stringify(value));
    rejected(
      run(f.source, "verify", f.output),
      /Unsafe artifact path|Invalid or duplicate|digest mismatch/,
    );
  }
});
void test("refuses unbound source contracts and unsupported Expo SDK before creating artifacts", () => {
  for (const kind of ["contract", "sdk"]) {
    const f = fixture();
    if (kind === "contract")
      put(
        f.source,
        "contracts/openapi.lock.json",
        JSON.stringify({ version: "1.50.2", sha256: "0".repeat(64) }),
      );
    else
      put(
        f.source,
        "node_modules/expo/package.json",
        JSON.stringify({ version: "59.0.0" }),
      );
    rejected(
      run(f.source, "seal", f.output),
      /OpenAPI lock mismatch|Unsupported Expo SDK/,
    );
    assert(!existsSync(path.join(f.output, "verify-export.ts")));
  }
});
