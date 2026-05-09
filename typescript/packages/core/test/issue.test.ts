import { describe, expect, it } from "vitest";
import { normalizeLabels } from "../src/issue.js";

describe("normalizeLabels", () => {
  it("lowercases labels and drops blank values", () => {
    expect(normalizeLabels(["Bug", "  Feature ", "", "REWORK"])).toEqual([
      "bug",
      "feature",
      "rework",
    ]);
  });
});
