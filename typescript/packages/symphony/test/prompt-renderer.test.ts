import { describe, expect, it } from "vitest";
import { renderPrompt } from "../src/prompt-renderer.js";

describe("renderPrompt", () => {
  it("renders issue and attempt variables", async () => {
    await expect(
      renderPrompt("Issue {{ issue.identifier }} attempt {{ attempt }}", {
        issue: { identifier: "MT-1" },
        attempt: 2,
      }),
    ).resolves.toBe("Issue MT-1 attempt 2");
  });

  it("fails unknown variables", async () => {
    await expect(renderPrompt("{{ missing.value }}", { issue: {}, attempt: null })).rejects.toThrow(
      "template_render_error",
    );
  });

  it("renders the default prompt for empty templates", async () => {
    await expect(renderPrompt(" \n ", { issue: {}, attempt: null })).resolves.toBe(
      "You are working on an issue from Linear.",
    );
  });

  it("fails unknown filters", async () => {
    await expect(renderPrompt("{{ issue.identifier | missing_filter }}", { issue: {}, attempt: null })).rejects.toThrow(
      "template_render_error",
    );
  });
});
