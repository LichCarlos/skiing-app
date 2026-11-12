import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { FavoriteRun, type FavoriteState } from "./favorite-run";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { cancelFavoriteReads, createFavoritePorts } from "./favorite-ports";
import { favoriteLedgerForAccount } from "./favorite-recovery";

/** Mounted under an account-keyed screen; cache effects belong to that account. */
export function useFavoriteRun(userId: number | null) {
  const cache = useQueryClient();
  const [epoch] = useState(sessionEpoch);
  const [ledger] = useState(() => favoriteLedgerForAccount(cache, userId));
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  const [state, setState] = useState<FavoriteState>({
    busy: false,
    pending: null,
    needsReview: false,
    notice: null,
  });
  const [run] = useState(
    () =>
      new FavoriteRun(
        {
          ...createFavoritePorts(userId, cache, epoch),
          changed: setState,
        },
        ledger,
      ),
  );
  useFocusEffect(
    useCallback(() => {
      run.activate();
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      return () => {
        run.dispose();
        setFocus((value) => ({ ...value, active: false }));
        if (sessionEpoch() === epoch) void cancelFavoriteReads(cache, userId);
      };
    }, [run, cache, userId, epoch]),
  );
  return { run, state, focus };
}
