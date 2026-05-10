import { getStore } from "../../../lib/shared-store";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const state = typeof body.state === "string" ? body.state.trim() : "Todo";
  const projectSlug =
    typeof body.projectSlug === 'string' && body.projectSlug.trim()
      ? body.projectSlug.trim()
      : 'symphony-local';

  if (!title) {
    return Response.json({ error: "title required" }, { status: 400 });
  }

  const store = await getStore();
  const identifier = `LOC-${Date.now().toString(36).toUpperCase()}`;
  const issue = await store.createIssue({
    identifier,
    title,
    description,
    state,
    projectSlug,
  });

  return Response.json(issue, { status: 201 });
}
