import { create } from "zustand";
import type { IssuePriority } from "@symphony/core";
import type {
  IssueDetails,
  KanbanIssue,
  ProjectRecord,
  ProjectWorkspace,
  RunProgress,
  RunProgressEvent,
} from "./graphql";
import {
  createIssue,
  createProject,
  deleteProject,
  fetchIssueDetails,
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
  { id: "Rework", label: "Rework", color: "#f97316" },
  { id: "Human Review", label: "Human Review", color: "#8b5cf6" },
  { id: "Merging", label: "Merging", color: "#14b8a6" },
  { id: "Done", label: "Done", color: "#22c55e" },
  { id: "Cancelled", label: "Cancelled", color: "#9b9b9b" },
  { id: "Canceled", label: "Canceled", color: "#9b9b9b" },
  { id: "Duplicate", label: "Duplicate", color: "#9b9b9b" },
  { id: "Closed", label: "Closed", color: "#9b9b9b" },
];

const DEFAULT_VISIBLE = ["Todo", "In Progress", "Rework", "Human Review", "Merging"];

interface KanbanStore {
  projects: ProjectRecord[];
  selectedProjectSlug: string | null;
  issues: KanbanIssue[];
  visibleColumns: string[];
  runs: Record<string, RunProgress>;
  runEvents: RunProgressEvent[];
  selectedIssueId: string | null;
  issueDetailsById: Record<string, IssueDetails>;
  issueDetailsLoading: boolean;
  issueDetailsError: string | null;
  isLoading: boolean;
  loadProjects: () => Promise<void>;
  loadIssues: () => Promise<void>;
  loadRuns: () => Promise<void>;
  loadIssueDetails: (issueId: string) => Promise<void>;
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
  openIssueDetails: (issueId: string) => Promise<void>;
  closeIssueDetails: () => void;
  toggleColumn: (columnId: string) => void;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  projects: [],
  selectedProjectSlug: null,
  issues: [],
  visibleColumns: DEFAULT_VISIBLE,
  runs: {},
  runEvents: [],
  selectedIssueId: null,
  issueDetailsById: {},
  issueDetailsLoading: false,
  issueDetailsError: null,
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
    const { runs, events } = await fetchRunProgress();
    set({
      runs: Object.fromEntries(runs.map((run) => [run.issueId, run])),
      runEvents: events,
    });
  },

  loadIssueDetails: async (issueId) => {
    set({ issueDetailsLoading: true, issueDetailsError: null });
    try {
      const issue = await fetchIssueDetails(issueId);
      set((state) => ({
        issueDetailsById: issue
          ? { ...state.issueDetailsById, [issueId]: issue }
          : state.issueDetailsById,
        issueDetailsLoading: false,
        issueDetailsError: issue ? null : "Issue not found",
      }));
    } catch (error) {
      set({
        issueDetailsLoading: false,
        issueDetailsError: error instanceof Error ? error.message : "Failed to load issue details",
      });
    }
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
    set({ selectedProjectSlug: slugId, selectedIssueId: null, issueDetailsError: null });
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
      selectedIssueId: get().selectedProjectSlug === slugId ? null : get().selectedIssueId,
    });
  },

  openIssueDetails: async (issueId) => {
    set({ selectedIssueId: issueId, issueDetailsError: null });
    await get().loadIssueDetails(issueId);
  },

  closeIssueDetails: () => {
    set({ selectedIssueId: null, issueDetailsError: null });
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
