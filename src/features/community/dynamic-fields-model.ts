export interface DynamicField {
  fieldKey: string;
  label: string;
  dataType: string;
  required: boolean;
  canRead: boolean;
  canWrite: boolean;
  defaultValue?: unknown;
  optionsDictType?: string | null;
}
export interface DynamicFieldSchema {
  entityType: "dynamic";
  groups: { groupKey: string; label: string; fields: DynamicField[] }[];
  options: Record<string, { value: string; label: string }[]>;
}
const types = [
  "text",
  "textarea",
  "integer",
  "decimal",
  "boolean",
  "date",
  "url",
  "single_select",
  "multi_select",
];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function parseDynamicFieldSchema(value: unknown): DynamicFieldSchema {
  if (
    !object(value) ||
    value.entityType !== "dynamic" ||
    !Array.isArray(value.groups) ||
    !object(value.options)
  )
    throw Error("动态字段定义不可用");
  const keys = new Set<string>();
  for (const group of value.groups) {
    if (
      !object(group) ||
      typeof group.groupKey !== "string" ||
      typeof group.label !== "string" ||
      !Array.isArray(group.fields)
    )
      throw Error("动态字段分组不可用");
    for (const field of group.fields) {
      if (
        !object(field) ||
        typeof field.fieldKey !== "string" ||
        !/^[a-z][a-z0-9_]*$/.test(field.fieldKey) ||
        keys.has(field.fieldKey) ||
        typeof field.label !== "string" ||
        !types.includes(String(field.dataType)) ||
        typeof field.required !== "boolean" ||
        typeof field.canRead !== "boolean" ||
        typeof field.canWrite !== "boolean" ||
        !(field.canRead || field.canWrite) ||
        !(
          field.optionsDictType === undefined ||
          field.optionsDictType === null ||
          typeof field.optionsDictType === "string"
        )
      )
        throw Error("动态字段定义不可用");
      keys.add(field.fieldKey);
    }
  }
  for (const options of Object.values(value.options))
    if (
      !Array.isArray(options) ||
      !options.every(
        (o) =>
          object(o) &&
          typeof o.value === "string" &&
          typeof o.label === "string",
      ) ||
      new Set(options.map((o) => o.value)).size !== options.length
    )
      throw Error("动态字段选项不可用");
  return value as unknown as DynamicFieldSchema;
}
export function initialDynamicFields(
  schema: DynamicFieldSchema,
  original: Record<string, unknown>,
  editing: boolean,
) {
  return Object.fromEntries(
    schema.groups.flatMap((g) =>
      g.fields.flatMap((f) =>
        f.canRead && Object.hasOwn(original, f.fieldKey)
          ? [[f.fieldKey, original[f.fieldKey]]]
          : !editing &&
              f.canWrite &&
              f.defaultValue !== undefined &&
              f.defaultValue !== null
            ? [[f.fieldKey, f.defaultValue]]
            : [],
      ),
    ),
  );
}
export function dynamicFieldChanges(
  schema: DynamicFieldSchema,
  submitted: Record<string, unknown>,
  original: Record<string, unknown>,
) {
  const fields = schema.groups.flatMap((g) => g.fields);
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(submitted)) {
    const field = fields.find((f) => f.fieldKey === key);
    if (!field || !field.canWrite) continue;
    if (JSON.stringify(value) === JSON.stringify(original[key])) continue;
    if (value !== null) {
      if (
        ["integer", "decimal"].includes(field.dataType) &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          (field.dataType === "integer" && !Number.isSafeInteger(value)))
      )
        throw Error(`${field.label}需要有效数值`);
      if (field.dataType === "boolean" && typeof value !== "boolean")
        throw Error(`${field.label}需要选择是或否`);
      if (
        field.dataType === "multi_select" &&
        (!Array.isArray(value) || !value.every((v) => typeof v === "string"))
      )
        throw Error(`${field.label}选项无效`);
    }
    changes[key] = value;
  }
  return changes;
}
