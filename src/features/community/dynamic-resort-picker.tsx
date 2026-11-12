import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { useDeferredValue, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../components/Themed";
import type { components } from "../../platform/api/openapi";
import { readResorts } from "../resorts/resort-query";
import { sessionEpoch } from "../../platform/auth/secure-session";

export type SelectedResort = components["schemas"]["DynamicResortVO"];

export function DynamicResortPicker({
  userId,
  epoch = sessionEpoch(),
  focusRevision = 0,
  value,
  onChange,
  disabled,
  canClear,
}: {
  userId: number;
  epoch?: number;
  focusRevision?: number;
  value: SelectedResort | null;
  onChange(this: void, resort: SelectedResort | null): void;
  disabled: boolean;
  canClear: boolean;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const keyword = useDeferredValue(search.trim());
  const resorts = useInfiniteQuery({
    queryKey: ["composer-resorts", userId, epoch, focusRevision, keyword],
    enabled: open && !disabled,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      readResorts(
        new URLSearchParams({
          page: String(pageParam),
          pageSize: "10",
          keyword,
          sortBy: "name",
          sortOrder: "asc",
        }),
        userId,
        signal,
        undefined,
        epoch,
      ),
    getNextPageParam: (page) => (page.hasNext ? page.page + 1 : undefined),
    retry: false,
  });
  const items = resorts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.section}>
      <Text style={styles.label}>关联雪场（选填）</Text>
      <Text style={styles.value}>{value?.name ?? "未关联雪场"}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.button}
        >
          <Text style={styles.action}>
            {open ? "收起选择" : value ? "更换雪场" : "选择雪场"}
          </Text>
        </Pressable>
        {value && canClear ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onChange(null)}
            style={styles.button}
          >
            <Text style={styles.action}>取消关联</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View style={styles.results}>
          <TextInput
            accessibilityLabel="搜索可关联雪场"
            value={search}
            onChangeText={setSearch}
            editable={!disabled}
            maxLength={200}
            placeholder="按雪场名称搜索"
            style={styles.search}
          />
          {resorts.isPending ? (
            <ActivityIndicator />
          ) : resorts.isError ? (
            <View>
              <Text style={styles.error}>雪场加载失败。</Text>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void resorts.refetch()}
                style={styles.button}
              >
                <Text style={styles.action}>重试</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {items.length === 0 ? (
                <Text style={styles.value}>没有找到可关联的雪场。</Text>
              ) : null}
              {items.map((resort) => (
                <Pressable
                  key={resort.resortId}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: value?.resortId === resort.resortId,
                  }}
                  disabled={disabled}
                  onPress={() => {
                    onChange({ resortId: resort.resortId, name: resort.name });
                    setOpen(false);
                  }}
                  style={styles.row}
                >
                  <Text style={styles.label}>{resort.name}</Text>
                  <Text style={styles.value}>
                    {[
                      resort.region.province,
                      resort.region.city,
                      resort.region.district,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
              ))}
              {resorts.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled || resorts.isFetchingNextPage}
                  onPress={() => void resorts.fetchNextPage()}
                  style={styles.button}
                >
                  <Text style={styles.action}>
                    {resorts.isFetchingNextPage ? "加载中" : "加载更多雪场"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  section: { marginTop: 20, gap: 8 },
  label: { color: colors.text, fontWeight: "600" },
  value: { color: colors.muted, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 16 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  action: { color: colors.primary, fontWeight: "600" },
  results: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  search: {
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  row: {
    minHeight: 60,
    gap: 4,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  error: { color: colors.error },
}));
