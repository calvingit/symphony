"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { issuePriorityLabel, type IssuePriority } from '@symphony/core';
import type { KanbanIssue, RunProgress } from "../lib/graphql";

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  none: '#9b9b9b',
  low: '#e2b73b',
  medium: '#f59e0b',
  high: '#ef4444',
  urgent: '#dc2626',
};

const STATE_ICONS: Record<string, string> = {
  Backlog: '#6b6b6b',
  Todo: '#e2b73b',
  'In Progress': '#3b82f6',
  Rework: '#f97316',
  'Human Review': '#8b5cf6',
  Merging: '#14b8a6',
  Done: '#22c55e',
  Cancelled: '#9b9b9b',
  Canceled: '#9b9b9b',
  Duplicate: '#9b9b9b',
  Closed: '#9b9b9b',
};

interface TaskCardProps {
  issue: KanbanIssue;
  run?: RunProgress;
  onClick?: (issue: KanbanIssue) => void;
}

export function TaskCard({ issue, run, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { issue },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const updatedDate = issue.updatedAt
    ? new Date(issue.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const stateColor = STATE_ICONS[issue.state] ?? '#6b6b6b';
  const priorityColor = issue.priority ? (PRIORITY_COLORS[issue.priority] ?? '#9b9b9b') : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='group bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-shadow'
      role='button'
      tabIndex={0}
      onClick={() => onClick?.(issue)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(issue);
        }
      }}>
      <div className='flex items-start gap-2'>
        <div className='flex items-center gap-1.5 min-w-0 flex-1'>
          <span
            className='w-2 h-2 rounded-full flex-shrink-0'
            style={{ backgroundColor: stateColor }}
          />
          <span className='text-xs text-gray-400 font-mono flex-shrink-0'>{issue.identifier}</span>
          {priorityColor && (
            <span
              className='inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium'
              style={{ backgroundColor: `${priorityColor}1A`, color: priorityColor }}>
              {issuePriorityLabel(issue.priority)}
            </span>
          )}
        </div>
        <button
          type='button'
          ref={setActivatorNodeRef}
          className='rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500 cursor-grab active:cursor-grabbing'
          aria-label={`Drag ${issue.identifier}`}
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}>
          <GripVertical className='w-3.5 h-3.5 flex-shrink-0' />
        </button>
      </div>

      <p className='mt-1.5 text-sm font-medium text-gray-800 leading-snug line-clamp-2'>
        {issue.title}
      </p>

      {updatedDate && <p className='mt-2 text-xs text-gray-400'>Updated {updatedDate}</p>}

      {run && (
        <div className='mt-2 flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1'>
          <span className='truncate text-xs font-medium text-gray-600'>
            {formatRunStatus(run.status)}
          </span>
          {run.attempt !== null && (
            <span className='text-[11px] text-gray-400'>#{run.attempt + 1}</span>
          )}
        </div>
      )}
    </div>
  );
}

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
