import { describe, it, expect } from "vitest";
import { evaluateFieldConditionGroup } from "../index";

describe("evaluateFieldConditionGroup (re-exported)", () => {
  it("is re-exported from the package entry", () => {
    expect(typeof evaluateFieldConditionGroup).toBe("function");
  });

  it("returns true for an empty or absent group", () => {
    expect(evaluateFieldConditionGroup(null, {})).toBe(true);
    expect(
      evaluateFieldConditionGroup({ logic: "all", conditions: [] }, {}),
    ).toBe(true);
  });

  it("combines conditions with all (AND)", () => {
    const group = {
      logic: "all" as const,
      conditions: [
        { field: "type", equals: "business" },
        { field: "country", notEmpty: true },
      ],
    };
    expect(
      evaluateFieldConditionGroup(group, { type: "business", country: "PL" }),
    ).toBe(true);
    expect(
      evaluateFieldConditionGroup(group, { type: "business", country: "" }),
    ).toBe(false);
  });

  it("combines conditions with any (OR) and normalizes scalars", () => {
    const group = {
      logic: "any" as const,
      conditions: [
        { field: "plan", equals: "pro" },
        { field: "seats", equals: 5 },
      ],
    };
    expect(
      evaluateFieldConditionGroup(group, { plan: "free", seats: "5" }),
    ).toBe(true);
    expect(evaluateFieldConditionGroup(group, { plan: "free", seats: 2 })).toBe(
      false,
    );
  });
});
