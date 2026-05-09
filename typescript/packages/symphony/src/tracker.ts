import type { Issue } from "@symphony/core";

export interface Tracker {
  fetchCandidateIssues(activeStates: string[]): Promise<Issue[]>;
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Map<string, Issue | null>>;
}
