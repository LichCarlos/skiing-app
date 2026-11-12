import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({
  owner: "about",
  epoch: 1,
  status: "anonymous",
  focus: { owner: "", active: false, revision: 0 },
  live: {
    current: { owner: "", focus: { owner: "", active: false, revision: 0 } },
  },
  effect: null as null | (() => () => void),
  options: null as null | { queryKey: readonly unknown[]; enabled: boolean },
  cancelQueries: vi.fn(async () => {}),
  query: {
    data: { siteName: "雪客" },
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(async () => ({})),
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => model.owner,
  useRef: () => model.live,
  useState: () => [
    model.focus,
    (value: typeof model.focus) => {
      model.focus = value;
    },
  ],
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ cancelQueries: model.cancelQueries }),
  useQuery: (options: typeof model.options) => {
    model.options = options;
    return model.query;
  },
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    model.effect = callback;
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({ status: model.status }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => model.epoch,
}));
import { useSiteConfig } from "./use-site-config";
let result: ReturnType<typeof useSiteConfig>;
function Harness() {
  result = useSiteConfig();
  return null;
}
function render() {
  renderToStaticMarkup(createElement(Harness));
  return result;
}
function focus() {
  render();
  const cleanup = model.effect!();
  render();
  return cleanup;
}
beforeEach(() => {
  vi.clearAllMocks();
  model.focus = { owner: "", active: false, revision: 0 };
  model.live = {
    current: { owner: "", focus: { owner: "", active: false, revision: 0 } },
  };
  model.query.isError = false;
  model.query.isPending = false;
  model.query.isFetching = false;
  model.epoch = 1;
  model.status = "anonymous";
});
describe("public config focus wiring (React state and router focus simulated)", () => {
  it("does not read or show cached content before focus", () => {
    const current = render();
    expect(model.options?.enabled).toBe(false);
    expect(current.data).toBeUndefined();
    expect(current.isPending).toBe(true);
    void current.refetch();
    expect(model.query.refetch).not.toHaveBeenCalled();
  });
  it("uses a new read key for every focus without prior policy data", () => {
    const cleanup = focus();
    const first = model.options?.queryKey;
    expect(model.options?.enabled).toBe(true);
    cleanup();
    focus();
    expect(model.options?.queryKey).not.toEqual(first);
  });
  it("cancels only its own observer scope on blur", () => {
    const cleanup = focus();
    const expectedPrefix = model.options!.queryKey.slice(0, 2);
    cleanup();
    expect(model.cancelQueries).toHaveBeenCalledWith({
      queryKey: expectedPrefix,
    });
    expect(render().data).toBeUndefined();
  });
  it("does not run a retry through an old rendered callback after blur", () => {
    const cleanup = focus();
    const retry = result.refetch;
    cleanup();
    void retry();
    expect(model.query.refetch).not.toHaveBeenCalled();
  });
  it("does not let an old callback or cleanup operate a later focus", () => {
    const oldCleanup = focus();
    const oldRetry = result.refetch;
    oldCleanup();
    const newCleanup = focus();
    model.cancelQueries.mockClear();
    void oldRetry();
    oldCleanup();
    expect(model.query.refetch).not.toHaveBeenCalled();
    expect(model.cancelQueries).not.toHaveBeenCalled();
    newCleanup();
    expect(model.cancelQueries).toHaveBeenCalledTimes(1);
  });
  it("uses Query single-flight instead of cancelling and restarting a manual retry", () => {
    focus();
    void result.refetch();
    expect(model.query.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
  });
  it("hides previous success data after a failed manual read", () => {
    focus();
    model.query.isError = true;
    const current = render();
    expect(current.data).toBeUndefined();
    expect(current.isError).toBe(true);
  });
  it.each(["epoch", "status"])(
    "stops the old observer and retry synchronously on a session %s boundary",
    (field) => {
      focus();
      const oldRetry = result.refetch;
      if (field === "epoch") model.epoch++;
      else model.status = "restoring";
      const current = render();
      expect(model.options?.enabled).toBe(false);
      expect(current.data).toBeUndefined();
      void oldRetry();
      expect(model.query.refetch).not.toHaveBeenCalled();
    },
  );
  it("starts a new focus read after the restore boundary cleared the previous cache", () => {
    const cleanup = focus();
    const oldKey = model.options?.queryKey;
    model.epoch++;
    model.status = "authenticated";
    render();
    cleanup();
    model.effect!();
    render();
    expect(model.options?.enabled).toBe(true);
    expect(model.options?.queryKey).not.toEqual(oldKey);
    void result.refetch();
    expect(model.query.refetch).toHaveBeenCalledTimes(1);
  });
  it("blocks an old retry immediately when credentials change before React rerenders", () => {
    focus();
    const retry = result.refetch;
    model.epoch++;
    void retry();
    expect(model.query.refetch).not.toHaveBeenCalled();
  });
});
