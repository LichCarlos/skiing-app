import { createThemedStyles, radius } from "../../theme";
import { Pressable, TextInput } from "../../components/controls";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { Text, useThemeColor } from "../../../components/Themed";
import { apiRequest } from "../../platform/api/api-client";
import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import { useAuthSession } from "../../platform/auth/session-provider";
import {
  entities,
  operations,
  operators,
  makeQuery,
  parseCatalogFields,
  parseCatalogPage,
  type Entity,
  type Filter,
  type QueryField,
  type QueryPage,
} from "./catalog-model";

export default function CatalogScreen() {
  const { user, status } = useAuthSession();
  return (
    <CatalogWorkspace
      key={`${user?.userId ?? "guest"}:${status}:${sessionEpoch()}`}
    />
  );
}
function CatalogWorkspace() {
  const styles = useStyles();
  const background = useThemeColor({}, "background"),
    text = useThemeColor({}, "text");
  const [entity, setEntity] = useState<Entity>("ski_resort"),
    [fields, setFields] = useState<QueryField[] | null>(null),
    [filters, setFilters] = useState<Filter[]>([]),
    [keyword, setKeyword] = useState(""),
    [sort, setSort] = useState(""),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [result, setResult] = useState<QueryPage | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [focused, setFocused] = useState(false),
    [epoch] = useState(sessionEpoch);
  const lifetime = useRef<AbortController | null>(null),
    active = useRef<AbortController | null>(null),
    query = useRef<ReturnType<typeof makeQuery> | null>(null);
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
    if (!lifetime.current || lifetime.current.signal.aborted)
      throw Error("页面已关闭");
  };
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      lifetime.current = controller;
      const reading = new AbortController();
      active.current = reading;
      setFocused(true);
      setFields(null);
      setResult(null);
      setError("");
      setBusy(false);
      void apiRequest<unknown>(`/catalog/${entity}/fields`, {
        signal: reading.signal,
        expectedSessionEpoch: epoch,
        cache: "no-store",
      })
        .then((value) => {
          check(reading.signal);
          setFields(parseCatalogFields(value));
        })
        .catch(() => {
          if (!reading.signal.aborted)
            setError("字段目录读取失败，请返回后重试。");
        });
      return () => {
        controller.abort();
        active.current?.abort();
        lifetime.current = null;
        setFocused(false);
      };
    }, [entity, epoch]),
  );
  async function search(page = 1) {
    if (!fields || busy || !focused || !lifetime.current) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    try {
      check(controller.signal);
      const body =
        page === 1
          ? {
              ...makeQuery(fields, filters, 1, sort, direction),
              ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
            }
          : { ...query.current!, page };
      setBusy(true);
      setError("");
      setResult(null);
      const value = await apiRequest<unknown>(`/catalog/${entity}/query`, {
        method: "POST",
        body,
        signal: controller.signal,
        expectedSessionEpoch: epoch,
        cache: "no-store",
      });
      check(controller.signal);
      query.current = body;
      setResult(parseCatalogPage(value, page));
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "查询失败");
    } finally {
      if (active.current === controller && !controller.signal.aborted)
        setBusy(false);
    }
  }
  const update = (index: number, patch: Partial<Filter>) => {
    if (busy) return;
    setFilters((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
    setResult(null);
  };
  if (!focused)
    return (
      <View>
        <Text>正在读取公开目录</Text>
      </View>
    );
  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { backgroundColor: background }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: "公开数据查询" }} />
      <Text style={styles.title}>按公开字段查询</Text>
      <Text>所有筛选条件同时满足，计数覆盖全部符合条件的数据。</Text>
      <View style={styles.row}>
        {Object.entries(entities).map(([key, label]) => (
          <Choice
            key={key}
            label={label}
            selected={entity === key}
            disabled={busy}
            onPress={() => {
              if (entity === key) return;
              active.current?.abort();
              lifetime.current?.abort();
              setFields(null);
              setKeyword("");
              setFilters([]);
              setSort("");
              setResult(null);
              setEntity(key as Entity);
            }}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel="搜索公开数据关键词"
        value={keyword}
        onChangeText={(text) => {
          setKeyword(text);
          setResult(null);
        }}
        editable={!busy}
        maxLength={200}
        placeholder="搜索关键词"
        placeholderTextColor={text}
        style={[styles.input, { backgroundColor: background, color: text }]}
      />
      {filters.map((filter, index) => {
        const field = fields?.find((f) => f.key === filter.field);
        return (
          <View key={index} style={styles.filter}>
            <Text style={styles.heading}>
              条件 {index + 1} · {field?.label}
            </Text>
            <View style={styles.row}>
              {fields
                ?.filter((f) => f.filterable)
                .map((f) => (
                  <Choice
                    key={f.key}
                    label={f.label}
                    selected={filter.field === f.key}
                    disabled={busy}
                    onPress={() =>
                      update(index, {
                        field: f.key,
                        op: operators(f)[0]!,
                        text: "",
                      })
                    }
                  />
                ))}
            </View>
            <View style={styles.row}>
              {field
                ? operators(field).map((op) => (
                    <Choice
                      key={op}
                      label={operations[op]}
                      selected={filter.op === op}
                      disabled={busy}
                      onPress={() => update(index, { op })}
                    />
                  ))
                : null}
            </View>
            {field?.dataType === "boolean" ||
            ["single_select", "multi_select"].includes(
              field?.dataType ?? "",
            ) ? (
              <View style={styles.row}>
                {(field?.dataType === "boolean"
                  ? [
                      { value: "true", label: "是" },
                      { value: "false", label: "否" },
                    ]
                  : (field?.options ?? [])
                ).map((o) => (
                  <Choice
                    key={o.value}
                    label={o.label}
                    selected={filter.text === o.value}
                    disabled={busy}
                    onPress={() => update(index, { text: o.value })}
                  />
                ))}
              </View>
            ) : (
              <TextInput
                accessibilityLabel={`条件${index + 1}的值`}
                value={filter.text}
                onChangeText={(text) => update(index, { text })}
                editable={!busy}
                maxLength={200}
                placeholder={
                  field?.dataType === "date" ? "YYYY-MM-DD" : "输入筛选值"
                }
                placeholderTextColor={text}
                style={[
                  styles.input,
                  { backgroundColor: background, color: text },
                ]}
              />
            )}
            <Choice
              label="移除条件"
              disabled={busy}
              onPress={() => {
                setFilters((current) => current.filter((_, i) => i !== index));
                setResult(null);
              }}
            />
          </View>
        );
      })}
      <Choice
        label="添加筛选条件"
        disabled={
          !fields ||
          busy ||
          filters.length >= 8 ||
          !fields.some((f) => f.filterable)
        }
        onPress={() => {
          const f = fields!.find((f) => f.filterable)!;
          setFilters((current) => [
            ...current,
            { field: f.key, op: operators(f)[0]!, text: "" },
          ]);
          setResult(null);
        }}
      />
      <Text style={styles.heading}>排序字段</Text>
      <View style={styles.row}>
        <Choice
          label="默认顺序"
          selected={!sort}
          disabled={busy}
          onPress={() => {
            setSort("");
            setResult(null);
          }}
        />
        {fields
          ?.filter((f) => f.sortable && f.dataType !== "multi_select")
          .map((f) => (
            <Choice
              key={f.key}
              label={f.label}
              selected={sort === f.key}
              disabled={busy}
              onPress={() => {
                setSort(f.key);
                setResult(null);
              }}
            />
          ))}
      </View>
      <View style={styles.row}>
        {(["asc", "desc"] as const).map((value) => (
          <Choice
            key={value}
            label={value === "asc" ? "升序" : "降序"}
            selected={direction === value}
            disabled={busy}
            onPress={() => {
              setDirection(value);
              setResult(null);
            }}
          />
        ))}
      </View>
      <Choice
        label={busy ? "查询中…" : "查询公开数据"}
        disabled={!fields || busy}
        onPress={() => void search()}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {result ? (
        <View style={styles.results}>
          <Text>
            共 {result.total} 条 · {new Date(result.asOf).toLocaleString()}
          </Text>
          {result.items.length ? (
            result.items.map((row) => (
              <View key={row.id} style={styles.filter}>
                <Choice
                  label={row.title}
                  onPress={() =>
                    router.push(
                      entity === "ski_resort"
                        ? `/resorts/${row.id}`
                        : entity === "article"
                          ? `/knowledge/${row.id}`
                          : `/dynamics/${row.id}`,
                    )
                  }
                />
                {fields?.map((f) => {
                  const value = f.key.startsWith("custom.")
                    ? row.customFields[f.key.slice(7)]
                    : row.fields[f.key];
                  return value === undefined || value === null ? null : (
                    <Text key={f.key}>
                      {f.label}：
                      {Array.isArray(value)
                        ? value.map(String).join("、")
                        : typeof value === "boolean"
                          ? value
                            ? "是"
                            : "否"
                          : typeof value === "string"
                            ? value
                            : JSON.stringify(value)}
                    </Text>
                  );
                })}
              </View>
            ))
          ) : (
            <Text>没有符合条件的数据，请减少筛选条件。</Text>
          )}
          <View style={styles.row}>
            <Choice
              label="上一页"
              disabled={busy || result.page <= 1}
              onPress={() => void search(result.page - 1)}
            />
            <Text>第 {result.page} 页</Text>
            <Choice
              label="下一页"
              disabled={busy || result.page * 20 >= result.total}
              onPress={() => void search(result.page + 1)}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
function Choice({
  label,
  selected = false,
  disabled = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}
const useStyles = createThemedStyles((colors) => ({
  screen: { padding: 16, gap: 16, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700" },
  heading: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  filter: { padding: 12, gap: 12, borderWidth: 1, borderColor: colors.border },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  selected: { borderColor: colors.primary, borderWidth: 3 },
  disabled: { opacity: 0.5 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  results: { gap: 16 },
  error: { color: colors.error },
}));
