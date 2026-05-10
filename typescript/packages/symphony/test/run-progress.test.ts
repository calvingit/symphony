import { describe, expect, it } from "vitest";
import { createRunProgressTracker } from "../src/run-progress.js";

const issue = {
  id: "issue-1",
  identifier: "LOC-1",
  title: "Work",
};

describe("run progress tracker", () => {
  it("keeps the latest run status and appends timeline events", () => {
    const tracker = createRunProgressTracker({ clock: () => "2026-01-01T00:00:00.000Z" });

    tracker.record({ issue, attempt: null, status: "claimed" });
    tracker.record({ issue, attempt: null, status: "running_codex", threadId: "thread-1" });
    tracker.record({ issue, attempt: null, status: "completed", threadId: "thread-1", turnId: "turn-1" });

    expect(tracker.snapshot().runs).toEqual([
      expect.objectContaining({
        issueId: "issue-1",
        identifier: "LOC-1",
        title: "Work",
        status: "completed",
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    ]);
    expect(tracker.snapshot().events.map((event) => event.status)).toEqual([
      "claimed",
      "running_codex",
      "completed",
    ]);
  });
});
