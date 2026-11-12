import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => native.token,
  setItemAsync: async (_key: string, value: string) => {
    native.token = value;
  },
  deleteItemAsync: async () => {
    native.token = null;
  },
}));
import { apiRequest } from "../src/platform/api/api-client";
import { clearSessionTokens } from "../src/platform/auth/secure-session";
import {
  login,
  logout,
  registerAccount,
} from "../src/platform/auth/auth-session";
import { createComposerSession } from "../src/features/community/composer-session";
import { ComposerRun } from "../src/features/community/composer-run";
import type { ComposerImage } from "../src/features/community/composer-model";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(process.env.COMPOSER_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  resortId: number;
  accounts: string[];
};
const password = process.env.COMPOSER_FIXTURE_PASSWORD,
  adminAccount = process.env.COMPOSER_ADMIN_ACCOUNT,
  adminPassword = process.env.COMPOSER_ADMIN_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_composer_validation" ||
  !password ||
  !adminAccount ||
  !adminPassword
)
  throw new Error("Loopback composer API and disposable fixture required");
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);
function image(name: string): ComposerImage {
  return {
    kind: "new",
    uri: `blob:composer-${name}`,
    name: `${name}.png`,
    mimeType: "image/png",
    size: png.length,
    file: new Blob([png], { type: "image/png" }),
  };
}
const signal = () => new AbortController().signal;
const fetchReal = globalThis.fetch;
let id = 0,
  owner = 0;
async function enter(index: number) {
  await logout();
  return login({ account: fixture.accounts[index]!, password: password! });
}
async function composer(userId: number, target: number | null) {
  const session = createComposerSession(userId, target);
  const saved = vi.fn();
  const run = new ComposerRun(target, session, { changed: () => {}, saved });
  run.activate();
  const original = await run.load(signal());
  return { session, run, original, saved };
}
beforeAll(async () => {
  await clearSessionTokens();
  for (const account of fixture.accounts)
    await registerAccount({ account, password: password!, nickname: account });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await logout();
  await clearSessionTokens();
});
describe("composer actual multipart / Nest / PostgreSQL / ClamAV with synthetic S3 HTTP", () => {
  it("creates a pending dynamic with two scanned images in order and a public resort", async () => {
    const user = await enter(0);
    owner = user.userId;
    const c = await composer(owner, null);
    expect(
      await c.run.submit({
        content: " composer-initial ",
        images: [image("first"), image("second")],
        resortId: fixture.resortId,
      }),
    ).toBe(true);
    expect(c.run.snapshot().outcome).toBe("confirmed");
    expect(c.saved).toHaveBeenCalledOnce();
    const page = await apiRequest<{ items: Array<{ dynamicId: number }> }>(
      "/me/dynamics?page=1&pageSize=20",
    );
    id = page.items[0]!.dynamicId;
    const detail = await createComposerSession(owner, id).read(signal());
    expect(detail).toMatchObject({
      content: "composer-initial",
      status: "pending",
      resort: { resortId: fixture.resortId },
    });
    expect(detail.images).toHaveLength(2);
    const response = await fetchReal(detail.images[0]!.url);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    c.run.dispose();
  });
  it("reuses one old Asset ID, uploads only the new image, unlinks the resort and requeues published edits", async () => {
    await logout();
    await login({ account: adminAccount!, password: adminPassword! });
    await apiRequest(`/admin/dynamics/${id}/moderation`, {
      method: "PATCH",
      body: { action: "approve", reason: "composer fixture approval" },
    });
    await enter(0);
    const c = await composer(owner, id),
      old = c.original!;
    expect(old.status).toBe("published");
    const retained = old.images[1]!;
    expect(
      await c.run.submit({
        content: "composer-final-edit",
        resortId: null,
        images: [
          {
            kind: "existing",
            assetId: retained.assetId,
            uri: retained.url,
            name: "retained.png",
          },
          image("third"),
        ],
      }),
    ).toBe(true);
    const detail = await createComposerSession(owner, id).read(signal());
    expect(detail).toMatchObject({
      content: "composer-final-edit",
      status: "pending",
      resort: null,
    });
    expect(detail.images.map((row) => row.assetId)).toEqual([
      retained.assetId,
      expect.any(String),
    ]);
    expect(detail.images[1]!.assetId).not.toBe(old.images[0]!.assetId);
    await expect(apiRequest(`/dynamics/${id}`)).rejects.toMatchObject({
      status: 404,
    });
    c.run.dispose();
  });
  it("prevents an outdated editor from overwriting an external change and supports explicit reload", async () => {
    const c = await composer(owner, id);
    await apiRequest(`/dynamics/${id}`, {
      method: "PATCH",
      body: { content: "external-editor-change" },
    });
    expect(
      await c.run.submit({
        content: "should-not-overwrite",
        images: [],
        resortId: null,
      }),
    ).toBe(false);
    expect(c.run.snapshot()).toMatchObject({ conflict: true, outcome: "idle" });
    expect((await c.session.read(signal())).content).toBe(
      "external-editor-change",
    );
    const latest = await c.run.load(signal());
    expect(c.run.acceptLatest(latest!)).toBe(true);
    const images = latest!.images.map((row) => ({
      kind: "existing" as const,
      assetId: row.assetId,
      uri: row.url,
      name: "existing.png",
    }));
    expect(
      await c.run.submit({
        content: "composer-final-edit",
        images,
        resortId: null,
      }),
    ).toBe(true);
    c.run.dispose();
  });
  it("rejects another account and old epochs, and never repeats a committed creation after response loss", async () => {
    const old = createComposerSession(owner, id);
    const b = await enter(1);
    await expect(
      createComposerSession(b.userId, id).read(signal()),
    ).rejects.toMatchObject({ status: 404 });
    const c = await composer(b.userId, null);
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const response = await fetchReal(url, options);
        if (String(url).endsWith("/dynamics") && options?.method === "POST") {
          posts++;
          await response.arrayBuffer();
          throw new TypeError("synthetic lost response after commit");
        }
        return response;
      },
    );
    const draft = {
      content: "composer-lost-response",
      resortId: null,
      images: [],
    };
    expect(await c.run.submit(draft)).toBe(false);
    expect(c.run.snapshot().outcome).toBe("uncertain");
    expect(await c.run.submit(draft)).toBe(false);
    expect(posts).toBe(1);
    c.run.dispose();
    c.run.activate();
    await c.run.load(signal());
    expect(await c.run.submit(draft)).toBe(false);
    expect(
      (await apiRequest<{ total: number }>("/me/dynamics?page=1&pageSize=20"))
        .total,
    ).toBe(1);
    vi.unstubAllGlobals();
    const spy = vi.fn(fetchReal);
    vi.stubGlobal("fetch", spy);
    await expect(old.read(signal())).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    c.run.dispose();
  });
});
