"use client";

import Link from "next/link";
import type { KanbanIssue, ProjectRecord, RunProgress } from "../lib/graphql";
import { buildOverviewModel, formatRunStatus } from "../lib/overview";

interface OverviewDashboardProps {
  isLoading: boolean;
  issues: KanbanIssue[];
  project: ProjectRecord | null;
  runs: Record<string, RunProgress>;
}

export function OverviewDashboard({
  isLoading,
  issues,
  project,
  runs,
}: OverviewDashboardProps) {
  const model = buildOverviewModel({ issues, runs });

  return (
    <main className="px-5 py-5">
      <div className="mx-auto max-w-6xl space-y-5">
        {!project ? (
          <StatusPanel
            title={isLoading ? "Loading project overview" : "No project selected"}
            tone="neutral"
          >
            {isLoading
              ? "Fetching projects, issues, and recent run activity..."
              : "Create a project or pick one from the selector to see its issue and run status."}
          </StatusPanel>
        ) : (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Project overview
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold text-gray-900">{project.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <Chip>{project.slugId}</Chip>
                    <Chip>{project.workspace.kind}</Chip>
                    {project.workspace.baseBranch && (
                      <Chip>base: {project.workspace.baseBranch}</Chip>
                    )}
                  </div>
                  <div className="mt-3 text-sm text-gray-600">
                    {formatWorkspace(project.workspace)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Total issues" value={String(model.totalIssueCount)} />
                  <MetricCard label="Active issues" value={String(model.activeIssueCount)} />
                  <MetricCard label="Running now" value={String(model.runningRunCount)} />
                  <MetricCard label="Needs attention" value={String(model.attentionCount)} />
                </div>
              </div>
            </section>

            {!model.hasIssues ? (
              <StatusPanel title="No issues in this project" tone="neutral">
                This project is configured, but it does not have any issues yet.
              </StatusPanel>
            ) : (
              <>
                <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    State overview
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {model.stateCounts.map((item) => (
                      <div
                        key={item.state}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {item.state}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-gray-900">
                          {item.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <Card title="Run overview">
                    <div className="grid gap-3 md:grid-cols-3">
                      <MetricCard label="Running" value={String(model.runningRunCount)} />
                      <MetricCard
                        label="Failed or retrying"
                        value={String(model.retryingOrFailedRunCount)}
                      />
                      <MetricCard
                        label="Last update"
                        value={model.lastRunUpdatedAt ? formatDate(model.lastRunUpdatedAt) : "No data"}
                      />
                    </div>

                    <div className="mt-4">
                      {model.highlightedRuns.length > 0 ? (
                        <div className="space-y-3">
                          {model.highlightedRuns.map((item) => (
                            <IssueRow
                              key={`${item.issue.id}-${item.run.status}`}
                              issue={item.issue}
                              meta={[
                                item.issue.state,
                                formatRunStatus(item.run.status),
                                item.run.attempt === null ? null : `Attempt #${item.run.attempt + 1}`,
                                item.run.updatedAt ? formatDate(item.run.updatedAt) : null,
                              ]}
                              detail={item.run.error ?? item.run.message}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyText>
                          No running or unhealthy runs right now. If Symphony is not running, this is
                          expected.
                        </EmptyText>
                      )}
                    </div>
                  </Card>

                  <Card title="Attention">
                    {model.attentionItems.length > 0 ? (
                      <div className="space-y-3">
                        {model.attentionItems.map((item) => (
                          <IssueRow
                            key={item.issue.id}
                            issue={item.issue}
                            meta={[
                              ...item.reasons,
                              item.run ? formatRunStatus(item.run.status) : null,
                              item.updatedAt ? formatDate(item.updatedAt) : null,
                            ]}
                            detail={item.run?.error ?? null}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyText>
                        No issues currently need manual attention.
                      </EmptyText>
                    )}
                  </Card>
                </section>

                <Card title="Recent issues">
                  {model.recentIssues.length > 0 ? (
                    <div className="space-y-3">
                      {model.recentIssues.map((issue) => (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          meta={[
                            issue.state,
                            issue.priority ? `Priority: ${issue.priority}` : null,
                            issue.updatedAt ? formatDate(issue.updatedAt) : null,
                          ]}
                          detail={issue.description}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyText>No issues to show.</EmptyText>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {props.title}
      </div>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {props.label}
      </div>
      <div className="mt-2 text-lg font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}

function StatusPanel(props: {
  title: string;
  tone: "neutral" | "warning";
  children: React.ReactNode;
}) {
  const className =
    props.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-gray-200 bg-white text-gray-700";
  return (
    <section className={`rounded-2xl border px-5 py-4 shadow-sm ${className}`}>
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 text-sm">{props.children}</div>
    </section>
  );
}

function Chip(props: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
      {props.children}
    </span>
  );
}

function IssueRow(props: {
  issue: KanbanIssue;
  meta: Array<string | null>;
  detail?: string | null;
}) {
  return (
    <Link
      href={`/issues/${encodeURIComponent(props.issue.identifier)}`}
      className="block rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 transition-colors hover:border-gray-300 hover:bg-white"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-2 py-1 font-mono text-[11px] text-gray-600">
          {props.issue.identifier}
        </span>
        {props.meta
          .filter((item): item is string => Boolean(item))
          .map((item) => (
            <span
              key={`${props.issue.id}-${item}`}
              className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600"
            >
              {item}
            </span>
          ))}
      </div>
      <div className="mt-2 text-sm font-medium text-gray-900">{props.issue.title}</div>
      {props.detail?.trim() && (
        <div className="mt-2 line-clamp-2 text-sm text-gray-600">{props.detail}</div>
      )}
    </Link>
  );
}

function EmptyText(props: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-500">{props.children}</div>;
}

function formatWorkspace(workspace: ProjectRecord["workspace"]): string {
  if (workspace.kind === "remote") {
    return workspace.remoteUrl ? `remote: ${workspace.remoteUrl}` : "remote workspace not set";
  }
  return workspace.localPath ? `local: ${workspace.localPath}` : "local workspace not set";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
