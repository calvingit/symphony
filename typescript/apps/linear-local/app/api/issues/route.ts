import { getStore } from "../../../lib/shared-store";
import { normalizeIssuePriority, normalizeLabels, type IssuePriority } from '@symphony/core';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const state = typeof body.state === 'string' ? body.state.trim() : 'Todo';
    const priority = parsePriorityInput(body.priority);
    const branchName =
      typeof body.branchName === 'string' && body.branchName.trim() ? body.branchName.trim() : null;
    const labels = Array.isArray(body.labels)
      ? normalizeLabels(
          (body.labels as unknown[]).filter((label): label is string => typeof label === 'string'),
        )
      : [];
    const projectSlug =
      typeof body.projectSlug === 'string' && body.projectSlug.trim()
        ? body.projectSlug.trim()
        : '';

    if (!title) {
      return Response.json({ error: 'title required' }, { status: 400 });
    }
    if (!projectSlug) {
      return Response.json({ error: 'projectSlug required' }, { status: 400 });
    }

    const store = await getStore();
    const project = await store.getProjectBySlug(projectSlug);
    if (!project) {
      return Response.json({ error: 'project not found' }, { status: 404 });
    }
    const identifier = `LOC-${Date.now().toString(36).toUpperCase()}`;
    const issue = await store.createIssue({
      identifier,
      title,
      description,
      priority,
      state,
      projectSlug,
      branchName,
      labels,
    });

    return Response.json(issue, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'issue_priority_invalid') {
      return Response.json({ error: 'priority invalid' }, { status: 400 });
    }
    throw error;
  }
}

function parsePriorityInput(value: unknown): IssuePriority | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('issue_priority_invalid');
  }
  const normalized = normalizeIssuePriority(value);
  if (!normalized) {
    throw new Error('issue_priority_invalid');
  }
  return normalized;
}
