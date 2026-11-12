import { describe, expect, it } from "vitest";
import { controlFeedback } from "./control-feedback";

const base = {
  disabled: false,
  pressed: false,
  focused: false,
  focusColor: "#2455F5",
};
describe("native touch and keyboard feedback", () => {
  it("preserves caller opacity and transforms when idle", () => {
    expect(controlFeedback(base)).toEqual({});
  });
  it("gives immediate feedback without layout or motion", () => {
    expect(controlFeedback({ ...base, pressed: true })).toEqual({
      opacity: 0.86,
    });
  });
  it("gives keyboard focus a theme-colored outline", () => {
    expect(controlFeedback({ ...base, focused: true })).toEqual({
      outlineColor: "#2455F5",
      outlineWidth: 2,
      outlineOffset: 3,
    });
  });
  it("disabled feedback wins over pressed and focus", () => {
    expect(
      controlFeedback({
        ...base,
        focused: true,
        pressed: true,
        disabled: true,
      }),
    ).toEqual({ opacity: 0.48 });
  });
});
