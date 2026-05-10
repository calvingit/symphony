import { create } from "zustand";
import type { IssuePriority } from "@symphony/core";
import type { KanbanIssue, ProjectRecord, ProjectWorkspace, RunProgress } from "./graphql";
import {
  createIssue,
  createProject,
  deleteProject,
  fetchIssues,
  fetchProjects,
  fetchRunProgress,
  updateIssueState,
  updateProject,
} from "./graphql";

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
  projects: ProjectRecord[];
  selectedProjectSlug: string | null;
  issues: KanbanIssue[];
  visibleColumns: string[];
  runs: Record<string, RunProgress>;
  isLoading: boolean;
  loadProjects: () => Promise<void>;
  loadIssues: () => Promise<void>;
  loadRuns: () => Promise<void>;
  moveIssue: (issueId: string, newState: string) => Promise<void>;
  addIssue: (input: {
    title: string;
    description: string;
    state: string;
    priority: IssuePriority | null;
    branchName: string | null;
    labels: string[];
  }) => Promise<void>;
  selectProject: (slugId: string) => void;
  addProject: (input: { slugId: string; name: string; workspace: ProjectWorkspace }) => Promise<void>;
  editProject: (
    slugId: string,
    input: { name?: string; workspace?: ProjectWorkspace },
  ) => Promise<void>;
  removeProject: (slugId: string) => Promise<void>;
  toggleColumn: (columnId: string) => void;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  projects: [],
  selectedProjectSlug: null,
  issues: [],
  visibleColumns: DEFAULT_VISIBLE,
  runs: {},
  isLoading: false,

  loadProjects: async () => {
    const projects = await fetchProjects();
    const current = get().selectedProjectSlug;
    const nextSelected =
      current && projects.some((project) => project.slugId === current)
        ? current
        : projects[0]?.slugId ?? null;
    set({ projects, selectedProjectSlug: nextSelected });
  },

  loadIssues: async () => {
    const projectSlug = get().selectedProjectSlug;
    if (!projectSlug) {
      set({ issues: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    const allStates = COLUMNS.map((c) => c.id);
    const issues = await fetchIssues(projectSlug, allStates);
    set({ issues, isLoading: false });
  },

  loadRuns: async () => {
    const runs = await fetchRunProgress();
    set({ runs: Object.fromEntries(runs.map((run) => [run.issueId, run])) });
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

  addIssue: async ({ title, description, state, priority, branchName, labels }) => {
    const projectSlug = get().selectedProjectSlug;
    if (!projectSlug) return;
    const issue = await createIssue({
      title,
      description,
      stateName: state,
      projectSlug,
      priority,
      branchName,
      labels,
    });
    if (issue) {
      set({ issues: [...get().issues, issue] });
    }
  },

  selectProject: (slugId) => {
    set({ selectedProjectSlug: slugId });
  },

  addProject: async (input) => {
    const project = await createProject(input);
    if (!project) return;
    set({
      projects: [...get().projects, project].sort((a, b) => a.slugId.localeCompare(b.slugId)),
      selectedProjectSlug: project.slugId,
      issues: [],
    });
  },

  editProject: async (slugId, input) => {
    const project = await updateProject(slugId, input);
    if (!project) return;
    set({
      projects: get().projects.map((existing) => (existing.slugId === slugId ? project : existing)),
    });
  },

  removeProject: async (slugId) => {
    const success = await deleteProject(slugId);
    if (!success) return;
    const projects = get().projects.filter((project) => project.slugId !== slugId);
    const selectedProjectSlug =
      get().selectedProjectSlug === slugId ? projects[0]?.slugId ?? null : get().selectedProjectSlug;
    set({
      projects,
      selectedProjectSlug,
      issues: get().selectedProjectSlug === slugId ? [] : get().issues,
    });
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
