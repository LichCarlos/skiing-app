import { queryOptions } from "@tanstack/react-query";
import { getSiteConfig, siteConfigKey } from "./site-config-api";

export const siteConfigKeys = {
  scope: (owner: string) => [...siteConfigKey, owner] as const,
  read: (owner: string, revision: number) =>
    [...siteConfigKey, owner, revision] as const,
};
export function siteConfigQueryOptions(owner: string, revision: number) {
  return queryOptions({
    queryKey: siteConfigKeys.read(owner, revision),
    queryFn: ({ signal }) => getSiteConfig(signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
