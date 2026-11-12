import { Text } from "../../../components/Themed";
import { createThemedStyles, radius } from "../../theme";
import { Pressable, TextInput } from "../../components/controls";
import { useState } from "react";
import { View } from "react-native";
import {
  resortSortLabels,
  resortStatusLabels,
  type ResortFitTag,
  type ResortFilters,
} from "./resort-query";

export function ResortFilterForm({
  value,
  onChange,
  onApply,
  onReset,
  error,
  fitTags = [],
  fitTagsUnavailable = false,
}: {
  value: ResortFilters;
  onChange: (value: ResortFilters) => void;
  onApply: () => void;
  onReset: () => void;
  error: string | null;
  fitTags?: ResortFitTag[];
  fitTagsUnavailable?: boolean;
}) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.form}>
      <TextInput
        accessibilityLabel="搜索雪场名称或地区"
        placeholder="搜索雪场或地区"
        value={value.keyword}
        onChangeText={(keyword) => onChange({ ...value, keyword })}
        onSubmitEditing={onApply}
        maxLength={100}
        style={styles.input}
        returnKeyType="search"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.action}>
          {expanded ? "收起筛选条件" : "展开筛选条件"}
        </Text>
      </Pressable>
      {expanded ? (
        <>
          <View style={styles.fields}>
            {(
              [
                ["province", "省份", 50],
                ["city", "城市", 50],
                ["district", "区县", 50],
                ["minPrice", "最低价格（元）", undefined],
                ["maxPrice", "最高价格（元）", undefined],
                ["minRating", "最低评分（0–5）", undefined],
                ["latitude", "参考纬度（-90–90）", undefined],
                ["longitude", "参考经度（-180–180）", undefined],
              ] as const
            ).map(([key, label, maxLength]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  value={value[key]}
                  onChangeText={(text) => onChange({ ...value, [key]: text })}
                  maxLength={maxLength}
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            ))}
          </View>
          <Text style={styles.label}>营业状态</Text>
          <View style={styles.choices} accessibilityRole="radiogroup">
            {[["", "全部状态"], ...Object.entries(resortStatusLabels)].map(
              ([status, label]) => (
                <Choice
                  key={status}
                  label={label}
                  selected={value.openStatus === status}
                  onPress={() => onChange({ ...value, openStatus: status })}
                />
              ),
            )}
          </View>
          <Text style={styles.label}>排序</Text>
          <View style={styles.choices} accessibilityRole="radiogroup">
            {Object.entries(resortSortLabels).map(([sort, label]) => (
              <Choice
                key={sort}
                label={label}
                selected={value.sortBy === sort}
                onPress={() =>
                  onChange({
                    ...value,
                    sortBy: sort as ResortFilters["sortBy"],
                  })
                }
              />
            ))}
          </View>
          <Text style={styles.label}>排序方向</Text>
          <View style={styles.choices} accessibilityRole="radiogroup">
            <Choice
              label="从低到高 / 升序"
              selected={value.sortOrder === "asc"}
              onPress={() => onChange({ ...value, sortOrder: "asc" })}
            />
            <Choice
              label="从高到低 / 降序"
              selected={value.sortOrder === "desc"}
              onPress={() => onChange({ ...value, sortOrder: "desc" })}
            />
          </View>
          <Text style={styles.label}>适配标签</Text>
          {fitTagsUnavailable ? (
            <Text style={styles.notice}>
              标签选项暂不可用，已选条件仍保留；可取消当前已选项。
            </Text>
          ) : null}
          <View style={styles.choices}>
            {(() => {
              const available = new Set(fitTags.map((tag) => tag.value));
              const selectedOnly = value.fitTags
                .filter((tag) => !available.has(tag))
                .map((tag) => ({ value: tag, label: tag }));
              const options = [...fitTags, ...selectedOnly];
              return options.length ? (
                options.map((tag) => {
                  const selected = value.fitTags.includes(tag.value);
                  return (
                    <Choice
                      key={tag.value}
                      label={tag.label}
                      selected={selected}
                      onPress={() =>
                        onChange({
                          ...value,
                          fitTags: selected
                            ? value.fitTags.filter((item) => item !== tag.value)
                            : [...value.fitTags, tag.value],
                        })
                      }
                    />
                  );
                })
              ) : (
                <Text style={styles.notice}>暂无可筛选的适配标签</Text>
              );
            })()}
          </View>
          <Text style={styles.label}>
            按距离排序时，同时填写参考纬度和经度；距离为直线距离。
          </Text>
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.choices}>
        <Pressable
          accessibilityRole="button"
          onPress={onApply}
          style={styles.apply}
        >
          <Text style={styles.applyText}>应用筛选 / 搜索</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onReset}
          style={styles.choice}
        >
          <Text>清除筛选</Text>
        </Pressable>
      </View>
    </View>
  );
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.selected]}
    >
      <Text style={selected ? styles.selectedText : undefined}>{label}</Text>
    </Pressable>
  );
}
const useStyles = createThemedStyles((colors) => ({
  form: { gap: 12 },
  fields: { gap: 10, flexDirection: "row", flexWrap: "wrap" },
  field: { flexGrow: 1, flexBasis: 140, gap: 6 },
  label: { fontSize: 13, color: colors.muted },
  notice: { fontSize: 13, color: colors.muted },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.primaryText },
  action: { color: colors.primary, paddingVertical: 8 },
  apply: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
  applyText: { color: colors.primaryText, fontWeight: "600" },
  error: { color: colors.error },
}));
