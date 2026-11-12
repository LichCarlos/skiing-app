import { useCallback, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { siteConfigKeys, siteConfigQueryOptions } from "./site-config-query";
export function useSiteConfig() {
  const client = useQueryClient();
  const instance = useId();
  const { status } = useAuthSession();
  const epoch = sessionEpoch();
  const owner = JSON.stringify([instance, status, epoch]);
  const lifetime = useRef({
    owner,
    focus: { owner, active: false, revision: 0 },
  });
  const live = lifetime.current;
  live.owner = owner;
  const [focus, setFocus] = useState(live.focus);
  const active = focus.active && focus.owner === owner;
  const query = useQuery({
    ...siteConfigQueryOptions(owner, focus.revision),
    enabled: active,
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      const current = {
        owner,
        active: true,
        revision: live.focus.revision + 1,
      };
      live.focus = current;
      setFocus(current);
      return () => {
        if (live.focus !== current) return;
        live.focus = { ...current, active: false };
        setFocus(live.focus);
        void client.cancelQueries({ queryKey: siteConfigKeys.scope(owner) });
      };
    }, [client, owner, live]),
  );
  return {
    data: active && !query.isError ? query.data : undefined,
    isError: active && query.isError,
    isPending: !active || query.isPending,
    isFetching: active && query.isFetching,
    refetch: () => {
      if (
        sessionEpoch() !== epoch ||
        live.owner !== owner ||
        live.focus !== focus ||
        !focus.active
      )
        return;
      return refetch({ cancelRefetch: false });
    },
  };
}
