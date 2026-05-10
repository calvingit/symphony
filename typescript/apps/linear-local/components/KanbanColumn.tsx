"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, MoreHorizontal } from "lucide-react";
import { TaskCard } from "./TaskCard";
import type { KanbanIssue, RunProgress } from "../lib/graphql";
import { COLUMNS } from "../lib/store";

interface KanbanColumnProps {
  columnId: string;
  issues: KanbanIssue[];
  runs: Record<string, RunProgress>;
  onCreateClick: (columnId: string) => void;
  onIssueClick: (issue: KanbanIssue) => void;
}

export function KanbanColumn({ columnId, issues, runs, onCreateClick, onIssueClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const column = COLUMNS.find((c: { id: string; label: string; color: string }) => c.id === columnId);
  const color = column?.color ?? "#6b6b6b";

  return (
    <div className="flex-shrink-0 w-[300px] flex flex-col max-h-full">
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-gray-700">{column?.label ?? columnId}</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {issues.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onCreateClick(columnId)}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-lg p-1.5 space-y-1.5 overflow-y-auto transition-colors ${
          isOver ? "bg-blue-50/50" : ""
        }`}
      >
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <TaskCard key={issue.id} issue={issue} run={runs[issue.id]} onClick={onIssueClick} />
          ))}
        </SortableContext>
      </div>

      <button
        onClick={() => onCreateClick(columnId)}
        className="mt-1 mx-1 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1"
      >
        <Plus className="w-3 h-3" />
        <span>New task</span>
      </button>
    </div>
  );
}
