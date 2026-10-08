import { describe, it, expect } from "vitest";
import {
  isFormFieldRequired,
  isFormFieldVisible,
  visibleFormFields,
} from "../index";

const VALIDATION = {
  required: true,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  pattern: null,
  customMessage: null,
};

const showForBusiness = {
  logic: "all" as const,
  conditions: [{ field: "type", equals: "business" }],
};

describe("isFormFieldVisible", () => {
  it("shows a field with no condition group", () => {
    expect(isFormFieldVisible({ showWhen: null }, {})).toBe(true);
  });

  it("follows the showWhen group as the values change mid-fill", () => {
    const field = { showWhen: showForBusiness };
    expect(isFormFieldVisible(field, { type: "personal" })).toBe(false);
    expect(isFormFieldVisible(field, { type: "business" })).toBe(true);
  });
});

describe("visibleFormFields", () => {
  it("drops hidden fields and keeps the caller's order and type", () => {
    const fields = [
      { name: "email", showWhen: null },
      { name: "vat", showWhen: showForBusiness },
      { name: "note", showWhen: null },
    ];
    expect(
      visibleFormFields(fields, { type: "personal" }).map((f) => f.name),
    ).toEqual(["email", "note"]);
    expect(
      visibleFormFields(fields, { type: "business" }).map((f) => f.name),
    ).toEqual(["email", "vat", "note"]);
  });
});

describe("isFormFieldRequired", () => {
  it("never requires a hidden field, even a validation-required one", () => {
    const field = {
      showWhen: showForBusiness,
      requiredWhen: null,
      validation: VALIDATION,
    };
    expect(
      isFormFieldRequired(field, { type: "personal" }),
      "The submission service drops a hidden field before its required check (form-submission.service.ts) - a client that still requires it blocks a submission the server would accept.",
    ).toBe(false);
    expect(isFormFieldRequired(field, { type: "business" })).toBe(true);
  });

  it("does not read an absent requiredWhen group as always-required", () => {
    const field = {
      showWhen: null,
      requiredWhen: null,
      validation: { ...VALIDATION, required: false },
    };
    expect(
      isFormFieldRequired(field, {}),
      "evaluateFieldConditionGroup(null) is vacuously true - without the null guard every optional field would turn required.",
    ).toBe(false);
  });

  it("turns required on when the requiredWhen group matches", () => {
    const field = {
      showWhen: null,
      requiredWhen: showForBusiness,
      validation: { ...VALIDATION, required: false },
    };
    expect(isFormFieldRequired(field, { type: "personal" })).toBe(false);
    expect(isFormFieldRequired(field, { type: "business" })).toBe(true);
  });

  it("keeps a validation-required visible field required regardless of requiredWhen", () => {
    const field = {
      showWhen: null,
      requiredWhen: showForBusiness,
      validation: VALIDATION,
    };
    expect(isFormFieldRequired(field, { type: "personal" })).toBe(true);
  });
});
