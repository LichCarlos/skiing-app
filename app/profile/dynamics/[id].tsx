import { Text } from "../../../components/Themed";
import { OwnDynamicDetailView } from "@/src/features/community/own-dynamic-detail";
import { useCallback, useState } from "react";
import {
  router,
  Stack,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {} from "react-native";
import {
  deleteDynamic,
  getOwnDynamic,
} from "@/src/features/community/community-api";
import {
  OwnDynamicsAccess,
  useOwnStyles,
} from "@/src/features/community/own-dynamics-ui";
import { useAuthSession } from "@/src/platform/auth/session-provider";
import {
  OwnDynamicRun,
  type OwnDynamicState,
} from "@/src/features/community/own-dynamic-run";
import {
  ownDynamicId,
  ownDynamicKeys,
  verifyOwnDynamicAccount,
} from "@/src/features/community/own-dynamics-query";

export default function OwnDynamicScreen() {
  const s = useOwnStyles();
  const { user } = useAuthSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dynamicId = ownDynamicId(id);
  return (
    <>
      <Stack.Screen options={{ title: "本人动态" }} />
      <OwnDynamicsAccess>
        {dynamicId !== null ? (
          <DynamicDetail key={`${user?.userId}:${dynamicId}`} id={dynamicId} />
        ) : (
          <Text style={s.error}>动态编号无效</Text>
        )}
      </OwnDynamicsAccess>
    </>
  );
}

function DynamicDetail({ id }: { id: number }) {
  const { user } = useAuthSession();
  const cache = useQueryClient();
  const userId = user!.userId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<OwnDynamicState>({
    ready: false,
    busy: false,
    uncertain: false,
    reviewed: false,
    error: null,
  });
  const detailKey = ownDynamicKeys.detail(userId, id);
  const [run] = useState(
    () =>
      new OwnDynamicRun(id, {
        verify: (signal, deleting) =>
          verifyOwnDynamicAccount(userId, signal, deleting),
        read: async (signal) => {
          const detail = await getOwnDynamic(id, signal);
          if (detail.author.userId !== userId)
            throw new Error("本人动态归属不符");
          return detail;
        },
        remove: (signal) => deleteDynamic(id, signal),
        changed: setState,
        removed: () => {
          setConfirmDelete(false);
          cache.removeQueries({ queryKey: detailKey, exact: true });
          cache.removeQueries({ queryKey: ["community-dynamic", id] });
          cache.removeQueries({ queryKey: ["community-comments", id] });
          void Promise.all([
            cache.invalidateQueries({ queryKey: ownDynamicKeys.lists(userId) }),
            cache.invalidateQueries({ queryKey: ["community-dynamics"] }),
          ]).catch(() => undefined);
          router.replace("/profile/dynamics");
        },
      }),
  );
  useFocusEffect(
    useCallback(() => {
      run.activate();
      setFocused(true);
      setConfirmDelete(false);
      return () => {
        run.dispose();
        setFocused(false);
        void cache.cancelQueries({ queryKey: detailKey, exact: true });
      };
    }, [run, cache, userId, id]),
  );
  const query = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => run.load(signal),
    enabled: focused,
    staleTime: 0,
    retry: false,
  });
  const item =
    focused && state.ready && !query.isError && !query.isFetching
      ? query.data
      : undefined;
  return (
    <OwnDynamicDetailView
      id={id}
      state={state}
      item={item}
      error={query.isError ? query.error : null}
      loading={query.isPending || query.isFetching}
      fetching={query.isFetching}
      confirmDelete={confirmDelete}
      canWrite={user!.permissionKeys.includes("community:dynamic:update-own")}
      onReload={() => {
        setConfirmDelete(false);
        void query.refetch();
      }}
      onReviewed={() => run.acknowledgeReview()}
      onDelete={() => {
        void run.remove();
      }}
      onConfirm={setConfirmDelete}
    />
  );
}
