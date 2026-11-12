import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type RecoveryState = { pending: boolean; failed: boolean };
type Action = {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityState?: { disabled: boolean; busy: boolean };
};
const model = vi.hoisted(() => ({
  state: { pending: false, failed: false } as RecoveryState,
  live: { current: { active: true, pending: false } },
  setState: vi.fn(),
  effect: undefined as undefined | (() => () => void),
  action: undefined as Action | undefined,
  link: undefined as undefined | { href: string; replace?: boolean },
  title: "",
}));

// Simulate state/effect lifetimes and explicitly invoke the native press handler.
// This is not a React Native renderer or an actual Router error capture.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [model.state, model.setState],
  useRef: () => model.live,
  useEffect: (effect: () => () => void) => {
    model.effect = effect;
  },
}));
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  Text: ({
    children,
    accessibilityRole,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
  }) => createElement("span", { role: accessibilityRole }, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Pressable: (props: Action & { children?: ReactNode }) => {
    model.action = props;
    return createElement(
      "button",
      { disabled: props.disabled },
      props.children,
    );
  },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { title: string } }) => {
      model.title = options.title;
      return null;
    },
  },
  Link: (props: { children?: ReactNode; href: string; replace?: boolean }) => {
    model.link = props;
    return createElement("a", { href: props.href }, props.children);
  },
  useLocalSearchParams: () => {
    throw new Error("Fallback must not read an unknown URL or query");
  },
}));
vi.mock("../auth/session-provider", () => {
  throw new Error("Fallback must not import the session provider");
});
vi.mock("../api/api-client", () => {
  throw new Error("Fallback must not import the API client");
});
vi.mock("@tanstack/react-query", () => {
  throw new Error("Fallback must not import the query provider");
});
vi.mock("react-native-safe-area-context", () => {
  throw new Error("Fallback must not need an ancestor safe-area provider");
});
vi.mock("../../../components/Themed", () => {
  throw new Error("Fallback must not need the application theme");
});

import NotFoundRoute from "../../../app/+not-found";
import { RouteErrorBoundary } from "./route-error-boundary";

const sensitive =
  "private-token password account@example.test /internal/server";
function renderBoundary(
  retry = vi.fn(async () => {}),
  error: unknown = new Error(sensitive),
) {
  return renderToStaticMarkup(
    createElement(RouteErrorBoundary, { retry, error: error as Error }),
  );
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  model.state = { pending: false, failed: false };
  model.live = { current: { active: true, pending: false } };
  model.action = undefined;
  model.link = undefined;
  model.title = "";
  model.effect = undefined;
  model.setState.mockImplementation((value: RecoveryState) => {
    model.state = value;
  });
});

describe("App route recovery (native UI and hook lifetimes simulated)", () => {
  it("renders a neutral Chinese fallback outside application providers", () => {
    const html = renderBoundary();
    expect(html).toContain("页面暂时无法显示");
    expect(html).toContain("请先核对处理结果");
    expect(html).toContain("重新加载页面");
    expect(html).not.toContain(sensitive);
    expect(html).not.toContain("Something went wrong");
    expect(model.link).toBeUndefined();
  });

  it("never inspects arbitrary thrown values or their getters", () => {
    const getter = vi.fn(() => {
      throw new Error("getter was read");
    });
    const error = Object.defineProperties(
      {},
      {
        message: { get: getter },
        stack: { get: getter },
        toString: { get: getter },
      },
    );
    for (const value of [null, undefined, sensitive, error]) {
      expect(renderBoundary(undefined, value)).toContain("页面暂时无法显示");
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not retry on render or effect setup", () => {
    const retry = vi.fn(async () => {});
    renderBoundary(retry);
    model.effect!();
    expect(retry).not.toHaveBeenCalled();
  });

  it("synchronously suppresses repeated presses until retry settles", async () => {
    const pending = deferred();
    const retry = vi.fn(() => pending.promise);
    renderBoundary(retry);
    const press = model.action!.onPress!;
    press();
    press();
    expect(retry).toHaveBeenCalledTimes(1);
    const html = renderBoundary(retry);
    expect(html).toContain("正在恢复页面");
    expect(model.action!.disabled).toBe(true);
    expect(model.action!.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    model.action!.onPress!();
    expect(retry).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
    renderBoundary(retry);
    expect(model.action!.disabled).toBe(false);
  });

  it("allows another explicit attempt after a successful retry", async () => {
    const retry = vi.fn(async () => {});
    renderBoundary(retry);
    const press = model.action!.onPress!;
    press();
    await flush();
    press();
    await flush();
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it.each(["synchronous", "asynchronous"])(
    "shows a fixed message after %s retry failure and allows manual recovery",
    async (kind) => {
      const retry = vi.fn((): Promise<void> => {
        if (kind === "synchronous") throw new Error(sensitive);
        return Promise.reject(new Error(sensitive));
      });
      renderBoundary(retry);
      model.action!.onPress!();
      await flush();
      const html = renderBoundary(retry);
      expect(html).toContain("暂时未能恢复页面");
      expect(html).toContain('role="alert"');
      expect(html).not.toContain(sensitive);
      expect(model.action!.disabled).toBe(false);
      retry.mockResolvedValue(undefined);
      model.action!.onPress!();
      await flush();
      expect(renderBoundary(retry)).not.toContain("暂时未能恢复页面");
    },
  );

  it.each(["resolve", "reject"] as const)(
    "ignores late %s and stale presses after unmount",
    async (settle) => {
      const pending = deferred();
      const retry = vi.fn(() => pending.promise);
      renderBoundary(retry);
      const cleanup = model.effect!();
      const press = model.action!.onPress!;
      press();
      cleanup();
      const writes = model.setState.mock.calls.length;
      if (settle === "resolve") pending.resolve();
      else pending.reject(new Error(sensitive));
      await flush();
      press();
      expect(model.setState).toHaveBeenCalledTimes(writes);
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the recovery action available after effect teardown/setup", async () => {
    const retry = vi.fn(async () => {});
    renderBoundary(retry);
    const setup = model.effect!;
    setup()();
    setup();
    model.action!.onPress!();
    await flush();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders the actual unmatched route in Chinese with a fixed replacing home link", () => {
    const html = renderToStaticMarkup(createElement(NotFoundRoute));
    expect(model.title).toBe("页面未找到");
    expect(html).toContain("链接已失效");
    expect(html).toContain("返回首页");
    expect(html).toContain('href="/"');
    expect(model.link).toMatchObject({ href: "/", replace: true });
    expect(html).not.toContain("Oops!");
    expect(html).not.toContain("This screen");
  });
});
