"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  X,
} from "lucide-react";
import { issuePriorityLabel, type IssuePriority } from "@symphony/core";
import type {
  IssueDetails,
  IssueRelation,
  IssueRelationIssueRef,
  RunProgress,
  RunProgressEvent,
} from "../lib/graphql";

interface IssueDetailsDialogProps {
  issueId: string | null;
  issue: IssueDetails | null;
  run?: RunProgress;
  runEvents: RunProgressEvent[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

export function IssueDetailsDialog(props: IssueDetailsDialogProps) {
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShowAllLabels(false);
    setShowEvents(false);
    setCopied(false);
  }, [props.issueId]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const runSnapshot = useMemo(
    () => buildRunSnapshot(props.run, props.runEvents),
    [props.run, props.runEvents],
  );

  if (!props.issueId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-10">
      <div className="fixed inset-0" onClick={props.onClose} />
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                {props.issue?.identifier ?? "Loading"}
              </span>
              {props.issue && <StateBadge state={props.issue.state} />}
              {props.run && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                  {formatRunStatus(props.run.status)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">
              {props.issue?.title ?? "Loading issue details..."}
            </h2>
            {props.issue && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => {
                    if (!props.issue) return;
                    if (!navigator.clipboard) return;
                    void navigator.clipboard.writeText(props.issue.identifier).then(() => {
                      setCopied(true);
                    });
                  }}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied identifier" : "Copy identifier"}
                </button>
                {props.issue.url && (
                  <a
                    href={props.issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open issue link
                  </a>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          {props.isLoading && !props.issue ? (
            <StatusPanel title="Loading issue details" tone="neutral">
              Fetching project, comments, blockers, and run context...
            </StatusPanel>
          ) : props.error ? (
            <StatusPanel title="Failed to load issue details" tone="error">
              {props.error}
            </StatusPanel>
          ) : !props.issue ? (
            <StatusPanel title="Issue not found" tone="error">
              The selected issue is no longer available.
            </StatusPanel>
          ) : (
            <div className="space-y-6">
              <section className="flex flex-col gap-6">
                <CardSection title="Labels">
                  {props.issue.labels.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {(showAllLabels ? props.issue.labels : props.issue.labels.slice(0, MAX_VISIBLE_LABELS)).map(
                          (label) => (
                            <LabelChip key={label.name} name={label.name} />
                          ),
                        )}
                      </div>
                      {props.issue.labels.length > MAX_VISIBLE_LABELS && (
                        <button
                          type="button"
                          onClick={() => setShowAllLabels((value) => !value)}
                          className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {showAllLabels
                            ? "Collapse labels"
                            : `Show all ${props.issue.labels.length} labels`}
                        </button>
                      )}
                    </>
                  ) : (
                    <EmptyText>No labels</EmptyText>
                  )}
                </CardSection>

                <CardSection title="Execution Context">
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <DetailRow label="Project">
                      <div className="space-y-1">
                        <div className="font-medium text-gray-800">
                          {props.issue.project?.name ?? "Unknown project"}
                        </div>
                        {props.issue.project?.slugId && (
                          <div className="text-xs text-gray-500">
                            slug: {props.issue.project.slugId}
                          </div>
                        )}
                      </div>
                    </DetailRow>
                    <DetailRow label="Priority">
                      <PriorityTag priority={props.issue.priority} />
                    </DetailRow>
                    <DetailRow label="Issue ID">
                      <CodeText value={props.issue.id} />
                    </DetailRow>
                    <DetailRow label="Branch">
                      <CodeText value={props.issue.branchName ?? "Not set"} />
                    </DetailRow>
                    <DetailRow label="Workspace">
                      <CodeText
                        value={
                          props.issue.project
                            ? formatWorkspaceSummary(props.issue.project)
                            : "Unknown"
                        }
                      />
                    </DetailRow>
                    <DetailRow label="Base branch">
                      <CodeText value={props.issue.project?.workspace.baseBranch ?? "Not set"} />
                    </DetailRow>
                    <DetailRow label="Created">
                      <span className="text-sm text-gray-700">{formatDate(props.issue.createdAt)}</span>
                    </DetailRow>
                    <DetailRow label="Updated">
                      <span className="text-sm text-gray-700">{formatDate(props.issue.updatedAt)}</span>
                    </DetailRow>
                  </div>
                </CardSection>
              </section>

              <CardSection title="Latest Run">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {props.run ? formatRunStatus(props.run.status) : "No recent run"}
                    </span>
                    {runSnapshot.attempt !== null && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                        Attempt #{runSnapshot.attempt + 1}
                      </span>
                    )}
                    {runSnapshot.lastUpdated && (
                      <span className="text-xs text-gray-500">
                        Updated {formatDate(runSnapshot.lastUpdated)}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-5">
                    {runSnapshot.stages.map((stage) => (
                      <div
                        key={stage.key}
                        className={stageClassName(stage.tone)}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide">
                          {stage.label}
                        </div>
                        <div className="mt-1 text-sm font-medium">{stage.value}</div>
                        {stage.timestamp && (
                          <div className="mt-1 text-[11px] text-gray-500">
                            {formatDate(stage.timestamp)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {runSnapshot.lastError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <div>
                          <div className="font-medium">Last error</div>
                          <div className="mt-1 whitespace-pre-wrap">{runSnapshot.lastError}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>No recent run errors</span>
                      </div>
                    </div>
                  )}

                  {runSnapshot.events.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEvents((value) => !value)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {showEvents ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {showEvents ? "Hide raw events" : `Show ${runSnapshot.events.length} raw events`}
                      </button>
                      {showEvents && (
                        <div className="space-y-2">
                          {runSnapshot.events.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span>{formatDate(event.createdAt)}</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600">
                                  {formatRunStatus(event.status)}
                                </span>
                                {event.eventName && (
                                  <CodeText value={formatEventName(event.eventName)} />
                                )}
                                {event.toolName && <CodeText value={event.toolName} />}
                              </div>
                              {event.message && (
                                <div className="mt-2 text-sm text-gray-700">{event.message}</div>
                              )}
                              {event.error && (
                                <div className="mt-2 text-sm text-red-600">{event.error}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <EmptyText>No run events yet</EmptyText>
                  )}
                </div>
              </CardSection>

              <section className="grid gap-6 lg:grid-cols-2">
                <CardSection title="Blocked By">
                  <RelationList
                    items={blockedByIssues(props.issue)}
                    emptyText="No active blockers recorded"
                  />
                </CardSection>
                <CardSection title="Blocks">
                  <RelationList
                    items={blockingIssues(props.issue)}
                    emptyText="This issue is not blocking anything"
                  />
                </CardSection>
              </section>

              <CardSection title="Comments">
                {props.issue.comments.length > 0 ? (
                  <div className="space-y-3">
                    {props.issue.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3"
                      >
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                          {formatDate(comment.updatedAt)}
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                          {comment.body}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyText>No comments yet</EmptyText>
                )}
              </CardSection>

              <CardSection title="Description">
                <DescriptionBody text={props.issue.description} />
              </CardSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {props.title}
      </div>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function StatusPanel(props: { title: string; tone: "neutral" | "error"; children: ReactNode }) {
  const toneClassName =
    props.tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div className={`rounded-xl border px-4 py-4 ${toneClassName}`}>
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 text-sm">{props.children}</div>
    </div>
  );
}

function DetailRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-start gap-3 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{props.label}</div>
      <div>{props.children}</div>
    </div>
  );
}

function PriorityTag(props: { priority: IssuePriority | null }) {
  const color = PRIORITY_COLORS[props.priority ?? "none"];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {issuePriorityLabel(props.priority)}
    </span>
  );
}

function LabelChip(props: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
      {props.name}
    </span>
  );
}

function StateBadge(props: { state: string }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
      {props.state}
    </span>
  );
}

function CodeText(props: { value: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
      <span className="truncate">{props.value}</span>
    </span>
  );
}

function EmptyText(props: { children: ReactNode }) {
  return <div className="text-sm text-gray-500">{props.children}</div>;
}

function RelationList(props: { items: IssueRelationIssueRef[]; emptyText: string }) {
  if (props.items.length === 0) {
    return <EmptyText>{props.emptyText}</EmptyText>;
  }
  return (
    <div className="space-y-2">
      {props.items.map((item) => (
        <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <CodeText value={item.identifier} />
            <StateBadge state={item.state} />
          </div>
          <div className="mt-2 text-sm font-medium text-gray-800">{item.title}</div>
        </div>
      ))}
    </div>
  );
}

function DescriptionBody(props: { text: string | null }) {
  if (!props.text?.trim()) {
    return <EmptyText>No description</EmptyText>;
  }

  const parts = props.text.split("```");
  return (
    <div className="space-y-3 text-sm text-gray-700">
      {parts.map((part, index) => {
        if (!part.trim()) return null;
        if (index % 2 === 1) {
          const lines = part.replace(/^\n+|\n+$/g, "").split("\n");
          const firstLine = lines[0]?.trim() ?? "";
          const hasLanguage = Boolean(firstLine) && /^[a-z0-9_-]+$/i.test(firstLine);
          const code = hasLanguage ? lines.slice(1).join("\n") : lines.join("\n");
          return (
            <div key={`code-${index}`} className="overflow-x-auto rounded-lg bg-gray-950 px-3 py-3 text-gray-100">
              {hasLanguage && (
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">
                  {firstLine}
                </div>
              )}
              <pre className="whitespace-pre-wrap font-mono text-xs">{code}</pre>
            </div>
          );
        }
        return (
          <div key={`text-${index}`} className="space-y-3 whitespace-pre-wrap">
            {part
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, paragraphIndex) => (
                <p key={`paragraph-${index}-${paragraphIndex}`}>{paragraph}</p>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function blockedByIssues(issue: IssueDetails): IssueRelationIssueRef[] {
  return dedupeRelations(
    issue.relations
      .filter((relation) => relation.type === "blocked_by" && relation.issue.id === issue.id)
      .map((relation) => relation.relatedIssue),
  );
}

function blockingIssues(issue: IssueDetails): IssueRelationIssueRef[] {
  return dedupeRelations(
    issue.relations
      .filter(
        (relation) => relation.type === "blocked_by" && relation.relatedIssue.id === issue.id,
      )
      .map((relation) => relation.issue),
  );
}

function dedupeRelations(items: IssueRelationIssueRef[]): IssueRelationIssueRef[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildRunSnapshot(run: RunProgress | undefined, events: RunProgressEvent[]) {
  const sortedEvents = [...events].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  const latestAttempt =
    run?.attempt ?? sortedEvents[sortedEvents.length - 1]?.attempt ?? null;
  const attemptEvents =
    latestAttempt === null
      ? sortedEvents
      : sortedEvents.filter((event) => event.attempt === latestAttempt);
  const status = run?.status ?? attemptEvents[attemptEvents.length - 1]?.status ?? null;
  const stageTimestamps = new Map<string, string>();

  for (const event of attemptEvents) {
    const stageKey = stageKeyForStatus(event.status);
    if (stageKey && !stageTimestamps.has(stageKey)) {
      stageTimestamps.set(stageKey, event.createdAt);
    }
  }

  const currentStageIndex = currentRunStageIndex(status);
  const terminalLabel = status === "failed" ? "Failed" : status === "retrying" ? "Retrying" : "Completed";
  const stages = RUN_STAGES.map((stage, index) => {
    if (stage.key === "terminal") {
      const tone: RunStageTone =
        status === "failed"
          ? "failed"
          : status === "completed"
            ? "done"
            : status === "retrying"
              ? "current"
              : "pending";
      return {
        ...stage,
        label: terminalLabel,
        value:
          tone === "pending"
            ? "Waiting"
            : tone === "failed"
              ? "Stopped"
              : tone === "done"
                ? "Finished"
                : "Retrying",
        tone,
        timestamp: stageTimestamps.get(stage.key) ?? run?.finishedAt ?? null,
      };
    }
    const tone: RunStageTone =
      currentStageIndex > index
        ? "done"
        : currentStageIndex === index
          ? "current"
          : "pending";
    return {
      ...stage,
      value:
        tone === "done" ? "Seen" : tone === "current" ? "Current" : "Waiting",
      tone,
      timestamp: stageTimestamps.get(stage.key) ?? null,
    };
  });

  return {
    attempt: latestAttempt,
    events: attemptEvents,
    stages,
    lastUpdated: run?.updatedAt ?? attemptEvents[attemptEvents.length - 1]?.createdAt ?? null,
    lastError:
      attemptEvents
        .slice()
        .reverse()
        .find((event) => event.error)?.error ??
      run?.error ??
      null,
  };
}

function stageKeyForStatus(status: string): string | null {
  switch (status) {
    case "claimed":
      return "claimed";
    case "preparing_workspace":
      return "workspace";
    case "running_hooks":
      return "hooks";
    case "running_codex":
    case "tool_call":
      return "codex";
    case "completed":
    case "failed":
    case "retrying":
      return "terminal";
    default:
      return null;
  }
}

function currentRunStageIndex(status: string | null): number {
  switch (status) {
    case "claimed":
      return 0;
    case "preparing_workspace":
      return 1;
    case "running_hooks":
      return 2;
    case "running_codex":
    case "tool_call":
      return 3;
    case "completed":
    case "failed":
    case "retrying":
      return 4;
    default:
      return -1;
  }
}

function stageClassName(tone: RunStageTone): string {
  switch (tone) {
    case "done":
      return "rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-green-700";
    case "current":
      return "rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-blue-700";
    case "failed":
      return "rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-red-700";
    default:
      return "rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-gray-600";
  }
}

function formatWorkspaceSummary(issueProject: NonNullable<IssueDetails["project"]>): string {
  const source =
    issueProject.workspace.kind === "remote"
      ? issueProject.workspace.remoteUrl
      : issueProject.workspace.localPath;
  return source
    ? `${issueProject.workspace.kind}: ${source}`
    : issueProject.workspace.kind;
}

function formatEventName(eventName: string): string {
  return eventName.replaceAll(".", " ");
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MAX_VISIBLE_LABELS = 6;

type RunStageTone = "done" | "current" | "pending" | "failed";

const RUN_STAGES = [
  { key: "claimed", label: "Claimed" },
  { key: "workspace", label: "Workspace" },
  { key: "hooks", label: "Hooks" },
  { key: "codex", label: "Codex" },
  { key: "terminal", label: "Completed" },
] as const;

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  none: "#9b9b9b",
  low: "#e2b73b",
  medium: "#f59e0b",
  high: "#ef4444",
  urgent: "#dc2626",
};

function formatRunStatus(status: string): string {
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
      return status;
  }
}
