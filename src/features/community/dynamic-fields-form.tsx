import { createThemedStyles } from "../../theme";
import { Pressable, TextInput } from "../../components/controls";
import { View } from "react-native";
import { Text, useThemeColor } from "../../../components/Themed";
import type { DynamicFieldSchema } from "./dynamic-fields-model";

export function DynamicFieldsForm({
  schema,
  values,
  onChange,
  disabled,
}: {
  schema: DynamicFieldSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const background = useThemeColor({}, "background"),
    text = useThemeColor({}, "text");
  const set = (key: string, value: unknown) => {
    if (!disabled) onChange({ ...values, [key]: value });
  };
  return (
    <View style={[styles.section, { backgroundColor: background }]}>
      {schema.groups.map((group) => (
        <View key={group.groupKey} style={styles.group}>
          <Text style={styles.heading}>{group.label}</Text>
          {group.fields.map((field) => {
            const value = values[field.fieldKey],
              options = schema.options[field.optionsDictType ?? ""] ?? [];
            const editable = !disabled && field.canWrite;
            return (
              <View key={field.fieldKey} style={styles.field}>
                <Text>
                  {field.label}
                  {field.required ? " *" : ""}
                  {!field.canWrite
                    ? "（只读）"
                    : !field.canRead
                      ? "（仅写入）"
                      : ""}
                </Text>
                {!field.canWrite ? (
                  <Text>
                    {value === undefined || value === null
                      ? "未填写"
                      : Array.isArray(value)
                        ? value.join("、")
                        : fieldText(value)}
                  </Text>
                ) : ["boolean", "single_select", "multi_select"].includes(
                    field.dataType,
                  ) ? (
                  <View style={styles.options}>
                    {(field.dataType === "boolean"
                      ? [
                          { value: "true", label: "是" },
                          { value: "false", label: "否" },
                        ]
                      : options
                    ).map((option) => {
                      const selected =
                        field.dataType === "multi_select"
                          ? Array.isArray(value) && value.includes(option.value)
                          : field.dataType === "boolean"
                            ? typeof value === "boolean" &&
                              String(value) === option.value
                            : value === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: selected,
                            disabled: !editable,
                          }}
                          disabled={!editable}
                          onPress={() =>
                            set(
                              field.fieldKey,
                              field.dataType === "boolean"
                                ? option.value === "true"
                                : field.dataType === "multi_select"
                                  ? selected
                                    ? (value as string[]).filter(
                                        (v) => v !== option.value,
                                      )
                                    : [
                                        ...(Array.isArray(value) ? value : []),
                                        option.value,
                                      ]
                                  : option.value,
                            )
                          }
                          style={[styles.option, selected && styles.selected]}
                        >
                          <Text>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                    {!options.length && field.dataType !== "boolean" ? (
                      <Text>当前没有可用选项</Text>
                    ) : null}
                  </View>
                ) : (
                  <TextInput
                    accessibilityLabel={field.label}
                    editable={editable}
                    value={
                      value === undefined || value === null
                        ? ""
                        : fieldText(value)
                    }
                    onChangeText={(text) =>
                      set(
                        field.fieldKey,
                        ["integer", "decimal"].includes(field.dataType)
                          ? text.trim() === ""
                            ? null
                            : /^-?(?:\d+\.?\d*|\.\d+)$/.test(text)
                              ? Number(text)
                              : text
                          : text,
                      )
                    }
                    placeholder={
                      field.dataType === "date"
                        ? "YYYY-MM-DD"
                        : field.canRead
                          ? "填写内容"
                          : "留空保持原值"
                    }
                    multiline={field.dataType === "textarea"}
                    maxLength={10000}
                    placeholderTextColor={text}
                    style={[
                      styles.input,
                      { backgroundColor: background, color: text },
                    ]}
                  />
                )}
                {field.canWrite && !field.required ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!editable}
                    onPress={() => set(field.fieldKey, null)}
                    style={styles.clear}
                  >
                    <Text>清除{field.label}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
function fieldText(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}
const useStyles = createThemedStyles((colors) => ({
  section: { gap: 16, marginTop: 16 },
  group: { gap: 12 },
  heading: { fontWeight: "700", fontSize: 16 },
  field: { gap: 8 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { borderColor: colors.primary, borderWidth: 3 },
  clear: { minHeight: 44, justifyContent: "center" },
}));
