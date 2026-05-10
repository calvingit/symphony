import Link from "next/link";
import { getStore } from "../../../lib/shared-store";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ identifier: string }>;
}

interface StateResponse {
  progress?: {
    runs?: Array<{
      identifier?: string;
      title?: string;
      status?: string;
      error?: string | null;
      attempt?: number | null;
      updatedAt?: string;
    }>;
  };
}

export default async function IssuePage({ params }: PageProps) {
  const { identifier } = await params;
  const store = await getStore();
  const issue = await findIssueByIdentifier(store, identifier);
  const comments = issue ? await store.listCommentsByIssueId(issue.id) : [];
  const project = issue ? await store.getProjectBySlug(issue.projectSlug) : null;
  const run = await findRunByIdentifier(identifier);

  return (
    <main className="min-h-screen bg-[#f7f7f7] px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Local issue
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">
              {issue?.title ?? run?.title ?? identifier}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <Badge>{identifier}</Badge>
              {issue?.state && <Badge>{issue.state}</Badge>}
              {run?.status && <Badge>{formatRunStatus(run.status)}</Badge>}
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Back to board
          </Link>
        </div>

        {!issue && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            This issue is not currently present in the local tracker store.
            {run
              ? " The latest Symphony run state is still available below."
              : " No matching Symphony run state was found either."}
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <Card title="Execution">
            {run ? (
              <div className="space-y-3 text-sm text-gray-700">
                <Detail label="Status" value={formatRunStatus(run.status)} />
                <Detail
                  label="Attempt"
                  value={run.attempt === null || run.attempt === undefined ? "Unknown" : `#${run.attempt + 1}`}
                />
                <Detail label="Updated" value={formatDate(run.updatedAt)} />
                {run.error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-red-700">
                    {run.error}
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-green-700">
                    No run error reported.
                  </div>
                )}
              </div>
            ) : (
              <EmptyText>No Symphony run data available.</EmptyText>
            )}
          </Card>

          <Card title="Context">
            <div className="space-y-3 text-sm text-gray-700">
              <Detail label="Project" value={project?.name ?? issue?.projectSlug ?? "Unknown"} />
              <Detail label="Branch" value={issue?.branchName ?? "Not set"} />
              <Detail label="Workspace" value={project ? formatWorkspace(project.workspace) : "Unknown"} />
              <Detail label="Created" value={formatDate(issue?.createdAt ?? null)} />
              <Detail label="Updated" value={formatDate(issue?.updatedAt ?? run?.updatedAt ?? null)} />
            </div>
          </Card>
        </section>

        <Card title="Description">
          {issue?.description?.trim() ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-700">{issue.description}</pre>
          ) : (
            <EmptyText>No description</EmptyText>
          )}
        </Card>

        <Card title="Comments">
          {comments.length > 0 ? (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {formatDate(comment.updatedAt)}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>No comments</EmptyText>
          )}
        </Card>
      </div>
    </main>
  );
}

async function findIssueByIdentifier(
  store: Awaited<ReturnType<typeof getStore>>,
  identifier: string,
) {
  const page = await store.listIssues({ first: 1000, after: null });
  return page.nodes.find((issue) => issue.identifier === identifier) ?? null;
}

async function findRunByIdentifier(identifier: string) {
  try {
    const response = await fetch(process.env.SYMPHONY_STATE_URL ?? "http://localhost:4010/api/v1/state", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as StateResponse;
    return (
      body.progress?.runs?.find((run) => typeof run.identifier === "string" && run.identifier === identifier) ??
      null
    );
  } catch {
    return null;
  }
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{props.title}</div>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{props.label}</div>
      <div className="mt-1">{props.value}</div>
    </div>
  );
}

function Badge(props: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
      {props.children}
    </span>
  );
}

function EmptyText(props: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-500">{props.children}</div>;
}

function formatWorkspace(workspace: {
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
}) {
  const source = workspace.kind === "remote" ? workspace.remoteUrl : workspace.localPath;
  return source ? `${workspace.kind}: ${source}` : workspace.kind;
}

function formatRunStatus(status: string | undefined) {
  switch (status) {
    case "claimed":
      return "Claimed";
    case "preparing_workspace":
      return "Preparing workspace";
    case "running_hooks":
      return "Running hooks";
    case "running_codex":
      return "Running Codex";
    case "tool_call":
      return "Tool call";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "retrying":
      return "Retrying";
    default:
      return status ?? "Unknown";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
