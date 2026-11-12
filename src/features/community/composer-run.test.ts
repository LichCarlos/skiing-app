import { describe, expect, it, vi } from "vitest";
import { ComposerRun } from "./composer-run";
import type { createComposerSession } from "./composer-session";
import { ComposerConflictError } from "./composer-model";
import { ApiError } from "../../platform/api/api-error";
import type { OwnDynamicDetail } from "./community-api";
import type { ComposerDraft } from "./composer-model";
const draft: ComposerDraft = { content: "snow", images: [], resortId: null };
const original = {
  dynamicId: 11,
  author: { userId: 7 },
  content: "snow",
  status: "published",
  updatedAt: "2026-11-02T00:00:00Z",
  resort: null,
  images: [],
  imageCount: 0,
} as unknown as OwnDynamicDetail;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function setup(id: number | null = null) {
  const session = {
    epoch: 4,
    check: (signal: AbortSignal) => signal.throwIfAborted(),
    verify: vi.fn(async (_s: AbortSignal) => {}),
    read: vi.fn(async () => original),
    upload: vi.fn(async () => ({ assetId: "10", status: "ready" as const })),
    remove: vi.fn(async (_id: string) => {}),
    save: vi.fn(
      async (
        _input: unknown,
        _baseline: unknown,
        _signal: AbortSignal,
        attempted: () => void,
      ) => {
        attempted();
        return { dynamicId: 11, status: "pending" as const };
      },
    ),
  };
  const saved = vi.fn(async () => {}),
    changed = vi.fn();
  const run = new ComposerRun(
    id,
    session as unknown as ReturnType<typeof createComposerSession>,
    { saved, changed },
  );
  run.activate();
  await run.load(new AbortController().signal);
  return { run, session, saved, changed };
}
describe("focused composer submission lifetime", () => {
  it("holds one lock across verification, selection, upload and save", async () => {
    const { run, session } = await setup();
    const ready = deferred<void>();
    session.verify.mockReturnValueOnce(ready.promise);
    const first = run.submit(draft);
    expect(await run.submit(draft)).toBe(false);
    expect(await run.pick(async () => "image", vi.fn())).toBe(false);
    expect(session.save).not.toHaveBeenCalled();
    ready.resolve();
    expect(await first).toBe(true);
    expect(session.save).toHaveBeenCalledOnce();
    expect(await run.submit(draft)).toBe(false);
  });
  it("does not send invalid input or upload before content validation", async () => {
    const { run, session } = await setup();
    expect(await run.submit({ ...draft, content: " " })).toBe(false);
    expect(session.upload).not.toHaveBeenCalled();
    expect(session.save).not.toHaveBeenCalled();
  });
  it("ignores a late picker result across blur/reactivation", async () => {
    const { run } = await setup(),
      picker = deferred<string>(),
      selected = vi.fn();
    const pending = run.pick(() => picker.promise, selected);
    await vi.waitFor(() => expect(run.snapshot().busy).toBe(true));
    run.dispose();
    run.activate();
    picker.resolve("old photo");
    expect(await pending).toBe(false);
    expect(selected).not.toHaveBeenCalled();
  });
  it("stops between verification and publication after blur", async () => {
    const { run, session } = await setup(),
      identity = deferred<void>();
    session.verify.mockReturnValueOnce(identity.promise);
    const pending = run.submit(draft);
    run.dispose();
    run.activate();
    identity.resolve();
    expect(await pending).toBe(false);
    expect(session.save).not.toHaveBeenCalled();
    expect(run.snapshot().outcome).toBe("idle");
  });
  it("keeps an in-flight publication unknown after returning to the page", async () => {
    const { run, session, saved } = await setup(),
      response = deferred<{ dynamicId: number; status: "pending" }>();
    session.save.mockImplementationOnce(
      async (_input, _baseline, _signal, attempted) => {
        attempted();
        return response.promise;
      },
    );
    const pending = run.submit(draft);
    await vi.waitFor(() => expect(session.save).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    response.resolve({ dynamicId: 11, status: "pending" });
    expect(await pending).toBe(false);
    expect(run.snapshot().outcome).toBe("uncertain");
    expect(saved).not.toHaveBeenCalled();
    expect(await run.submit(draft)).toBe(false);
  });
  it("blocks lost responses without repeating the publication", async () => {
    const { run, session } = await setup();
    session.save.mockImplementationOnce(
      async (_input, _baseline, _signal, attempted) => {
        attempted();
        throw new Error("response lost");
      },
    );
    expect(await run.submit(draft)).toBe(false);
    expect(run.snapshot().outcome).toBe("uncertain");
    expect(await run.submit(draft)).toBe(false);
    expect(session.save).toHaveBeenCalledOnce();
  });
  it("keeps confirmed results confirmed even when navigation fails", async () => {
    const { run, saved } = await setup();
    saved.mockRejectedValue(new Error("navigation failed"));
    expect(await run.submit(draft)).toBe(true);
    expect(run.snapshot()).toMatchObject({ outcome: "confirmed", busy: false });
    expect(await run.submit(draft)).toBe(false);
  });
  it("does not relabel an edit conflict as an unconfirmed publication", async () => {
    const { run, session } = await setup(11);
    session.save.mockRejectedValue(new ComposerConflictError());
    expect(await run.submit(draft)).toBe(false);
    expect(run.snapshot()).toMatchObject({ outcome: "idle", conflict: true });
    expect(await run.submit(draft)).toBe(false);
  });
  it("requires explicit acceptance before replacing the editing baseline", async () => {
    const { run, session } = await setup(11);
    const changed = { ...original, content: "external" };
    session.read.mockResolvedValue(changed);
    await run.load(new AbortController().signal);
    expect(run.snapshot().conflict).toBe(true);
    const oldFocus = run.focusId();
    run.dispose();
    run.activate();
    expect(run.acceptLatest(changed, oldFocus)).toBe(false);
    await run.load(new AbortController().signal);
    expect(run.acceptLatest(changed)).toBe(true);
    expect(run.snapshot().conflict).toBe(false);
    expect(await run.submit(draft)).toBe(true);
    expect(session.save.mock.calls.at(-1)?.[1]).toEqual(changed);
  });
  it("cleans only new uploads after definitive save rejection", async () => {
    const { run, session } = await setup(11);
    session.save.mockImplementationOnce(
      async (_input, _baseline, _signal, attempted) => {
        attempted();
        throw new ApiError("bad", { status: 400, code: 400, traceId: null });
      },
    );
    const images: ComposerDraft["images"] = [
      { kind: "existing", assetId: "9", uri: "https://a.test/9", name: "old" },
      {
        kind: "new",
        uri: "file:///10.png",
        name: "new.png",
        mimeType: "image/png",
        size: 10,
        file: null,
      },
    ];
    expect(await run.submit({ ...draft, images })).toBe(false);
    expect(session.remove).toHaveBeenCalledExactlyOnceWith(
      "10",
      expect.any(AbortSignal),
    );
    expect(run.snapshot().outcome).toBe("idle");
  });
  it.each([
    new ComposerConflictError(),
    new TypeError("preflight network failure"),
  ])(
    "cleans new uploads when edit preflight fails before the command: %s",
    async (error) => {
      const { run, session } = await setup(11);
      session.save.mockRejectedValueOnce(error);
      expect(
        await run.submit({
          ...draft,
          images: [
            {
              kind: "existing",
              assetId: "9",
              uri: "https://a.test/9",
              name: "old",
            },
            {
              kind: "new",
              uri: "file:///10.png",
              name: "new.png",
              mimeType: "image/png",
              size: 10,
              file: null,
            },
          ],
        }),
      ).toBe(false);
      expect(session.remove).toHaveBeenCalledExactlyOnceWith(
        "10",
        expect.any(AbortSignal),
      );
      expect(run.snapshot()).toMatchObject({
        outcome: "idle",
        conflict: error instanceof ComposerConflictError,
      });
    },
  );
});
