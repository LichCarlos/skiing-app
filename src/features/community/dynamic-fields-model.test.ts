import { describe, expect, it } from "vitest";
import {
  parseDynamicFieldSchema,
  initialDynamicFields,
  dynamicFieldChanges,
  type DynamicFieldSchema,
} from "./dynamic-fields-model";
const schema: DynamicFieldSchema = {
  entityType: "dynamic",
  options: {},
  groups: [
    {
      groupKey: "snow",
      label: "雪况",
      fields: [
        {
          fieldKey: "depth",
          label: "雪深",
          dataType: "integer",
          required: false,
          canRead: true,
          canWrite: true,
          defaultValue: 0,
        },
        {
          fieldKey: "private_note",
          label: "仅写入",
          dataType: "text",
          required: false,
          canRead: false,
          canWrite: true,
          defaultValue: "default",
        },
        {
          fieldKey: "review",
          label: "审核",
          dataType: "text",
          required: false,
          canRead: true,
          canWrite: false,
        },
      ],
    },
  ],
};
describe("dynamic field permissions and partial writes", () => {
  it("accepts the effective dynamic schema and rejects another entity", () => {
    expect(parseDynamicFieldSchema(schema)).toEqual(schema);
    expect(() =>
      parseDynamicFieldSchema({ ...schema, entityType: "article" }),
    ).toThrow();
  });
  it("never hydrates a write-only value or its default while editing", () => {
    expect(
      initialDynamicFields(
        schema,
        { depth: 0, private_note: "secret", review: "approved" },
        true,
      ),
    ).toEqual({ depth: 0, review: "approved" });
  });
  it("uses falsy defaults only when creating", () => {
    expect(initialDynamicFields(schema, {}, false)).toEqual({
      depth: 0,
      private_note: "default",
    });
  });
  it("sends only changed writable fields, including explicit clearing", () => {
    expect(
      dynamicFieldChanges(
        schema,
        { depth: null, review: "tampered", unknown: "x" },
        { depth: 0, review: "approved" },
      ),
    ).toEqual({ depth: null });
  });
  it.each(["oops", NaN, Infinity, 1.5])(
    "rejects invalid numeric input %s",
    (value) => {
      expect(() => dynamicFieldChanges(schema, { depth: value }, {})).toThrow(
        "雪深",
      );
    },
  );
  it("rejects duplicated field keys and malformed options", () => {
    expect(() =>
      parseDynamicFieldSchema({
        ...schema,
        groups: [...schema.groups, ...schema.groups],
      }),
    ).toThrow();
    expect(() =>
      parseDynamicFieldSchema({ ...schema, options: { invalid: [null] } }),
    ).toThrow();
  });
});
