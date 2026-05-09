import { create } from "zustand";
import type { KanbanIssue } from "./graphql";
import { createIssue, fetchIssues, updateIssueState } from "./graphql";

export const COLUMNS = [
  { id: "Backlog", label: "Backlog", color: "#6b6b6b" },
  { id: "Todo", label: "Todo", color: "#e2b73b" },
  { id: "In Progress", label: "In Progress", color: "#3b82f6" },
  { id: "Human Review", label: "Human Review", color: "#8b5cf6" },
  { id: "Done", label: "Done", color: "#22c55e" },
  { id: "Cancelled", label: "Cancelled", color: "#9b9b9b" },
  { id: "Canceled", label: "Canceled", color: "#9b9b9b" },
  { id: "Duplicate", label: "Duplicate", color: "#9b9b9b" },
  { id: "Closed", label: "Closed", color: "#9b9b9b" },
];

const DEFAULT_VISIBLE = ["Backlog", "Todo", "In Progress", "Human Review"];

interface KanbanStore {
  issues: KanbanIssue[];
  visibleColumns: string[];
  isLoading: boolean;
  loadIssues: () => Promise<void>;
  moveIssue: (issueId: string, newState: string) => Promise<void>;
  addIssue: (title: string, state: string) => Promise<void>;
  toggleColumn: (columnId: string) => void;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  issues: [],
  visibleColumns: DEFAULT_VISIBLE,
  isLoading: false,

  loadIssues: async () => {
    set({ isLoading: true });
    const allStates = COLUMNS.map((c) => c.id);
    const issues = await fetchIssues(allStates);
    set({ issues, isLoading: false });
  },

  moveIssue: async (issueId, newState) => {
    const prev = get().issues;
    set({
      issues: prev.map((i) => (i.id === issueId ? { ...i, state: newState } : i)),
    });
    try {
      await updateIssueState(issueId, newState);
    } catch {
      set({ issues: prev });
    }
  },

  addIssue: async (title, state) => {
    const issue = await createIssue(title, state);
    if (issue) {
      set({ issues: [...get().issues, issue] });
    }
  },

  toggleColumn: (columnId) => {
    const visible = get().visibleColumns;
    set({
      visibleColumns: visible.includes(columnId)
        ? visible.filter((c) => c !== columnId)
        : [...visible, columnId],
    });
  },
}));
