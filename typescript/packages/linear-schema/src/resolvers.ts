import type { LocalIssue, LocalProjectWorkspace } from './store.js';
import { normalizeIssuePriority, normalizeLabels } from '@symphony/core';

export const resolvers = {
  Query: {
    projects: async (_parent: unknown, _args: unknown, context: any) =>
      context.store.listProjects(),
    project: async (_parent: unknown, args: { slugId: string }, context: any) =>
      context.store.getProjectBySlug(args.slugId),
    issues: async (
      _parent: unknown,
      args: {
        filter?: { project?: { slugId?: { eq?: string } }; state?: { name?: { in?: string[] } } };
        first?: number;
        after?: string;
      },
      context: any,
    ) => {
      const result = await context.store.listIssues({
        projectSlug: args.filter?.project?.slugId?.eq,
        stateNames: args.filter?.state?.name?.in,
        first: args.first ?? 50,
        after: args.after ?? null,
      });
      return {
        nodes: result.nodes,
        pageInfo: { hasNextPage: result.hasNextPage, endCursor: result.endCursor },
      };
    },
    issue: async (_parent: unknown, args: { id: string }, context: any) => {
      const [issue] = await context.store.getIssuesByIds([args.id]);
      return issue ?? null;
    },
    nodes: async (_parent: unknown, args: { ids: string[] }, context: any) =>
      context.store.getIssuesByIds(args.ids),
  },
  Mutation: {
    projectCreate: async (
      _parent: unknown,
      args: { input: { slugId: string; name: string; workspace: LocalProjectWorkspace } },
      context: any,
    ) => {
      const workspace = validateWorkspaceInput(args.input.workspace);
      const project = await context.store.createProject({
        slugId: args.input.slugId,
        name: args.input.name,
        workspace,
      });
      return { success: Boolean(project), project };
    },
    projectUpdate: async (
      _parent: unknown,
      args: { slugId: string; input: { name?: string; workspace?: LocalProjectWorkspace } },
      context: any,
    ) => {
      const project = await context.store.updateProject(args.slugId, {
        name: typeof args.input.name === 'string' ? args.input.name : undefined,
        workspace: args.input.workspace ? validateWorkspaceInput(args.input.workspace) : undefined,
      });
      return { success: Boolean(project), project };
    },
    projectDelete: async (_parent: unknown, args: { slugId: string }, context: any) => ({
      success: await context.store.deleteProject(args.slugId),
    }),
    issueCreate: async (
      _parent: unknown,
      args: {
        input: {
          title: string;
          description?: string | null;
          priority?: string | null;
          stateName: string;
          projectSlug: string;
          branchName?: string | null;
          labels?: string[] | null;
        };
      },
      context: any,
    ) => {
      const identifier = `LOC-${Date.now().toString(36).toUpperCase()}`;
      const issue = await context.store.createIssue({
        identifier,
        title: args.input.title,
        description:
          typeof args.input.description === 'string'
            ? args.input.description
            : (args.input.description ?? null),
        priority: parsePriorityInput(args.input.priority, { allowUndefined: false }),
        state: args.input.stateName,
        projectSlug: args.input.projectSlug,
        branchName:
          typeof args.input.branchName === 'string' && args.input.branchName.trim()
            ? args.input.branchName.trim()
            : null,
        labels: Array.isArray(args.input.labels)
          ? normalizeLabels(
              args.input.labels.filter((label): label is string => typeof label === 'string'),
            )
          : [],
      });
      return { success: Boolean(issue), issue };
    },
    issueUpdate: async (
      _parent: unknown,
      args: { id: string; input: Record<string, unknown> },
      context: any,
    ) => {
      const issue = await context.store.updateIssue(args.id, {
        title: typeof args.input.title === 'string' ? args.input.title : undefined,
        description:
          typeof args.input.description === 'string' ? args.input.description : undefined,
        state: typeof args.input.stateName === 'string' ? args.input.stateName : undefined,
        priority: parsePriorityInput(args.input.priority, { allowUndefined: true }),
        branchName: typeof args.input.branchName === 'string' ? args.input.branchName : undefined,
        url: typeof args.input.url === 'string' ? args.input.url : undefined,
        labels: Array.isArray(args.input.labels)
          ? normalizeLabels(
              args.input.labels.filter((label): label is string => typeof label === 'string'),
            )
          : undefined,
      });
      return { success: Boolean(issue), issue };
    },
    commentCreate: async (
      _parent: unknown,
      args: { issueId: string; body: string },
      context: any,
    ) => {
      const comment = await context.store.createComment(args.issueId, args.body);
      return { success: Boolean(comment), comment };
    },
    commentUpdate: async (_parent: unknown, args: { id: string; body: string }, context: any) => {
      const comment = await context.store.updateComment(args.id, args.body);
      return { success: Boolean(comment), comment };
    },
  },
  Issue: {
    state: (issue: LocalIssue) => ({
      id: `state-${issue.state}`,
      name: issue.state,
      type: issue.state,
    }),
    project: async (issue: LocalIssue, _args: unknown, context: any) => {
      const project = await context.store.getProjectBySlug(issue.projectSlug);
      return (
        project ?? {
          id: `project-${issue.projectSlug}`,
          slugId: issue.projectSlug,
          name: issue.projectSlug,
          workspace: fallbackWorkspace(),
        }
      );
    },
    labels: (issue: LocalIssue) => ({
      nodes: issue.labels.map((name) => ({ id: `label-${name}`, name })),
    }),
    relations: () => ({ nodes: [] }),
    comments: async (issue: LocalIssue, _args: unknown, context: any) => ({
      nodes: await context.store.listCommentsByIssueId(issue.id),
    }),
  },
};

function normalizeWorkspaceInput(input: LocalProjectWorkspace): LocalProjectWorkspace {
  return {
    kind: input.kind === 'remote' ? 'remote' : 'local',
    localPath:
      typeof input.localPath === 'string' && input.localPath.trim() ? input.localPath.trim() : null,
    remoteUrl:
      typeof input.remoteUrl === 'string' && input.remoteUrl.trim() ? input.remoteUrl.trim() : null,
    baseBranch:
      typeof input.baseBranch === 'string' && input.baseBranch.trim()
        ? input.baseBranch.trim()
        : null,
  };
}

function validateWorkspaceInput(input: LocalProjectWorkspace): LocalProjectWorkspace {
  const normalized = normalizeWorkspaceInput(input);
  if (!normalized.baseBranch) {
    throw new Error('project_workspace_base_branch_required');
  }
  if (normalized.kind === 'local' && !normalized.localPath) {
    throw new Error('project_workspace_local_path_required');
  }
  if (normalized.kind === 'remote' && !normalized.remoteUrl) {
    throw new Error('project_workspace_remote_url_required');
  }
  return normalized;
}

function fallbackWorkspace(): LocalProjectWorkspace {
  return {
    kind: 'local',
    localPath: null,
    remoteUrl: null,
    baseBranch: 'main',
  };
}

function parsePriorityInput(
  value: unknown,
  options: { allowUndefined: boolean },
): string | null | undefined {
  if (value === undefined) {
    return options.allowUndefined ? undefined : null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('issue_priority_invalid');
  }
  const normalized = normalizeIssuePriority(value);
  if (!normalized) {
    throw new Error('issue_priority_invalid');
  }
  return normalized;
}
