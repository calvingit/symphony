"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { issuePriorityLabel, type IssuePriority } from "@symphony/core";
import type { KanbanIssue, RunProgress } from "../lib/graphql";

interface IssueDetailsDialogProps {
  issue: KanbanIssue | null;
  run?: RunProgress;
  onClose: () => void;
}

export function IssueDetailsDialog({ issue, run, onClose }: IssueDetailsDialogProps) {
  if (!issue) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {issue.identifier}
            </div>
            <h2 className="mt-1 text-base font-semibold text-gray-900">{issue.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <DetailRow label="State">
              <span className="text-sm text-gray-700">{issue.state}</span>
            </DetailRow>
            <DetailRow label="Priority">
              <PriorityTag priority={issue.priority} />
            </DetailRow>
            <DetailRow label="Created">
              <span className="text-sm text-gray-700">{formatDate(issue.createdAt)}</span>
            </DetailRow>
            <DetailRow label="Updated">
              <span className="text-sm text-gray-700">{formatDate(issue.updatedAt)}</span>
            </DetailRow>
            <DetailRow label="Branch">
              <span className="text-sm text-gray-700">{issue.branchName ?? "Not set"}</span>
            </DetailRow>
            <DetailRow label="Labels">
              <div className="flex flex-wrap gap-2">
                {issue.labels.length > 0 ? (
                  issue.labels.map((label) => (
                    <span
                      key={label.name}
                      className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">None</span>
                )}
              </div>
            </DetailRow>
          </div>

          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Description
            </div>
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap">
              {issue.description?.trim() ? issue.description : "No description"}
            </div>
          </section>

          {run && (
            <section>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Run status
              </div>
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <div>{formatRunStatus(run.status)}</div>
                {run.message && <div className="mt-1 text-xs text-gray-500">{run.message}</div>}
                {run.error && <div className="mt-1 text-xs text-red-600">{run.error}</div>}
              </div>
            </section>
          )}

          {issue.url && (
            <div className="flex justify-end">
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
              >
                Open issue link
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-3 py-2">
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

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
