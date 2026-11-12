import { useCallback, useEffect, useState } from "react";
import { router, Stack, useFocusEffect, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "../../platform/auth/session-provider";
import { aiKeys, createAiSession } from "./ai-session";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { AiAccess } from "./ai-ui";
import {
  AiConversationListRun,
  lastConversationPage,
  type AiListState,
} from "./conversation-list-run";
import { ConversationListView } from "./conversation-list";
import { aiListRecoveryFor } from "./list-recovery";

export default function AiConversationsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "滑雪 AI" }} />
      <AiAccess epoch={sessionEpoch()}>
        <ConversationList />
      </AiAccess>
    </>
  );
}
function ConversationList() {
  const { user } = useAuthSession();
  const userId = user!.userId;
  const [session] = useState(() => createAiSession(userId));
  const [focusRevision, setFocusRevision] = useState(0);
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<AiListState>({
    busy: null,
    error: null,
    uncertain: false,
    reviewed: false,
    ready: false,
  });
  const [run] = useState(
    () =>
      new AiConversationListRun(
        {
          verify: session.verify,
          list: (page, signal) => session.list(page, signal),
          create: (signal) => session.create(signal),
          remove: (id, signal) => session.remove(id, signal),
          changed: setState,
          created: (conversation) => {
            // Confirmed creation must navigate even if invalidation fails later.
            void cache
              .invalidateQueries({
                queryKey: aiKeys.list(userId, session.epoch),
              })
              .catch(() => undefined);
            router.push(`/ai/${conversation.conversationId}` as Href);
          },
          removed: (id) => {
            setDeleteId(null);
            cache.removeQueries({
              queryKey: aiKeys.detail(userId, session.epoch, id),
            });
            void cache
              .invalidateQueries({
                queryKey: aiKeys.list(userId, session.epoch),
              })
              .catch(() => undefined);
          },
        },
        aiListRecoveryFor(cache, userId),
      ),
  );
  const query = useQuery({
    queryKey: [...aiKeys.list(userId, session.epoch), page, focusRevision],
    queryFn: ({ signal }) => run.loadPage(page, signal),
    enabled: focused,
    staleTime: 0,
    retry: false,
  });
  useFocusEffect(
    useCallback(() => {
      run.activate();
      setFocusRevision((value) => value + 1);
      setFocused(true);
      setDeleteId(null);
      return () => {
        run.dispose();
        setFocused(false);
        void cache.cancelQueries({
          queryKey: aiKeys.list(userId, session.epoch),
        });
      };
    }, [run, cache, userId, session]),
  );
  useEffect(() => {
    if (
      !focused ||
      !state.ready ||
      query.isError ||
      query.isFetching ||
      query.data?.page !== page
    )
      return;
    const last = lastConversationPage(query.data.total, query.data.pageSize);
    if (page > last) {
      setDeleteId(null);
      setPage(last);
    }
  }, [focused, state.ready, query.isError, query.isFetching, query.data, page]);
  return (
    <ConversationListView
      state={state}
      data={query.data}
      error={query.isError ? query.error : null}
      page={page}
      loading={query.isPending}
      fetching={query.isFetching}
      deleteId={deleteId}
      onCreate={() => {
        void run.create();
      }}
      onDelete={(id) => {
        void run.remove(id);
      }}
      onConfirm={setDeleteId}
      onPage={(next) => {
        setDeleteId(null);
        setPage(next);
      }}
      onReload={() => {
        void query.refetch();
      }}
      onReviewed={() => run.acknowledgeReview()}
    />
  );
}
