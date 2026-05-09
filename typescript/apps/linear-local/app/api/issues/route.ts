import { getStore } from "../../../lib/shared-store";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "Todo";

  if (!title) {
    return Response.json({ error: "title required" }, { status: 400 });
  }

  const store = getStore();
  const identifier = `LOC-${Date.now().toString(36).toUpperCase()}`;
  const issue = await store.createIssue({
    identifier,
    title,
    state,
    projectSlug: "symphony-local",
  });

  return Response.json(issue, { status: 201 });
}
