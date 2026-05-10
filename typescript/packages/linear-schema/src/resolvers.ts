import type { LocalIssue } from "./store.js";

export const resolvers = {
  Query: {
    issues: async (_parent: unknown, args: { filter?: { project?: { slugId?: { eq?: string } }; state?: { name?: { in?: string[] } } }; first?: number; after?: string }, context: any) => {
      const result = await context.store.listIssues({
        projectSlug: args.filter?.project?.slugId?.eq,
        stateNames: args.filter?.state?.name?.in,
        first: args.first ?? 50,
        after: args.after ?? null,
      });
      return { nodes: result.nodes, pageInfo: { hasNextPage: result.hasNextPage, endCursor: result.endCursor } };
    },
    issue: async (_parent: unknown, args: { id: string }, context: any) => {
      const [issue] = await context.store.getIssuesByIds([args.id]);
      return issue ?? null;
    },
    nodes: async (_parent: unknown, args: { ids: string[] }, context: any) => context.store.getIssuesByIds(args.ids),
  },
  Mutation: {
    issueUpdate: async (_parent: unknown, args: { id: string; input: Record<string, unknown> }, context: any) => {
      const issue = await context.store.updateIssue(args.id, {
        title: typeof args.input.title === "string" ? args.input.title : undefined,
        description: typeof args.input.description === "string" ? args.input.description : undefined,
        state: typeof args.input.stateName === "string" ? args.input.stateName : undefined,
        priority: Number.isInteger(args.input.priority) ? Number(args.input.priority) : undefined,
        branchName: typeof args.input.branchName === "string" ? args.input.branchName : undefined,
        url: typeof args.input.url === "string" ? args.input.url : undefined,
        labels: Array.isArray(args.input.labels) ? args.input.labels.filter((label): label is string => typeof label === "string") : undefined,
      });
      return { success: Boolean(issue), issue };
    },
    commentCreate: async (_parent: unknown, args: { issueId: string; body: string }, context: any) => {
      const comment = await context.store.createComment(args.issueId, args.body);
      return { success: Boolean(comment), comment };
    },
    commentUpdate: async (_parent: unknown, args: { id: string; body: string }, context: any) => {
      const comment = await context.store.updateComment(args.id, args.body);
      return { success: Boolean(comment), comment };
    },
  },
  Issue: {
    state: (issue: LocalIssue) => ({ id: `state-${issue.state}`, name: issue.state, type: issue.state }),
    project: (issue: LocalIssue) => ({ id: `project-${issue.projectSlug}`, slugId: issue.projectSlug, name: issue.projectSlug }),
    labels: (issue: LocalIssue) => ({ nodes: issue.labels.map((name) => ({ id: `label-${name}`, name })) }),
    relations: () => ({ nodes: [] }),
    comments: async (issue: LocalIssue, _args: unknown, context: any) => ({
      nodes: await context.store.listCommentsByIssueId(issue.id),
    }),
  },
};
