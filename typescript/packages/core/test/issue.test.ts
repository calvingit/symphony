import { describe, expect, it } from "vitest";
import {
  issuePriorityLabel,
  issuePriorityWeight,
  normalizeIssuePriority,
  normalizeLabels,
} from "../src/issue.js";

describe("normalizeLabels", () => {
  it("lowercases labels and drops blank values", () => {
    expect(normalizeLabels(["Bug", "  Feature ", "", "REWORK"])).toEqual([
      "bug",
      "feature",
      "rework",
    ]);
  });

  it("normalizes string priorities", () => {
    expect(normalizeIssuePriority(" HIGH ")).toBe("high");
    expect(normalizeIssuePriority("later")).toBeNull();
    expect(normalizeIssuePriority(null)).toBeNull();
  });

  it("returns labels and weights for priorities", () => {
    expect(issuePriorityLabel("urgent")).toBe("Urgent");
    expect(issuePriorityLabel(null)).toBe("None");
    expect(issuePriorityWeight("urgent")).toBeGreaterThan(issuePriorityWeight("low"));
    expect(issuePriorityWeight(null)).toBe(0);
  });
});
