import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { components } from "../api/openapi";
import { apiRequest } from "../api/api-client";
import { login, logout, restoreSession, type LoginInput } from "./auth-session";
import {
  subscribeSessionChange,
  sessionBoundaryMessage,
} from "./secure-session";
import {
  SessionController,
  type AuthStatus,
  type SessionState,
} from "./session-controller";
export type { AuthStatus } from "./session-controller";
type CurrentUser = components["schemas"]["CurrentUserVO"];
interface AuthSessionValue {
  user: CurrentUser | null;
  status: AuthStatus;
  restoreError: string | null;
  signIn(input: LoginInput): Promise<void>;
  signOut(expected?: Pick<CurrentUser, "userId" | "account">): Promise<void>;
  retryRestore(): Promise<void>;
  clearRestoreError(): void;
  applyProfile(profile: components["schemas"]["UserProfileVO"]): void;
  refreshProfile(signal?: AbortSignal): Promise<CurrentUser>;
}
const AuthSessionContext = createContext<AuthSessionValue | null>(null);
export function AuthSessionProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const [state, setState] = useState<SessionState>({
    user: null,
    status: "restoring",
    restoreError: null,
  });
  const [controller] = useState(
    () =>
      new SessionController({
        login,
        logout,
        restore: restoreSession,
        profile: (signal) =>
          apiRequest<CurrentUser>("/auth/me", { cache: "no-store", signal }),
        subscribe: subscribeSessionChange,
        boundaryMessage: sessionBoundaryMessage,
        changed: setState,
      }),
  );
  useEffect(() => {
    controller.activate();
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return (
    <AuthSessionContext.Provider
      value={{
        ...state,
        signIn: (input) => controller.signIn(input),
        signOut: (expected) => controller.signOut(expected),
        retryRestore: () => controller.restore(),
        clearRestoreError: () => controller.clearRestoreError(),
        applyProfile: (profile) => controller.applyProfile(profile),
        refreshProfile: (signal) => controller.refreshProfile(signal),
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}
export function useAuthSession(): AuthSessionValue {
  const value = useContext(AuthSessionContext);
  if (!value)
    throw new Error("useAuthSession must be wrapped in AuthSessionProvider");
  return value;
}
