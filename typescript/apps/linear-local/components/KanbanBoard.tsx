"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { HiddenColumns } from "./HiddenColumns";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { useKanbanStore, COLUMNS } from "../lib/store";
import type { KanbanIssue } from "../lib/graphql";

export function KanbanBoard() {
  const { issues, visibleColumns, loadIssues, moveIssue, addIssue, toggleColumn } =
    useKanbanStore();

  const [activeIssue, setActiveIssue] = useState<KanbanIssue | null>(null);
  const [createColumn, setCreateColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const issue = issues.find((i: KanbanIssue) => i.id === event.active.id);
      setActiveIssue(issue ?? null);
    },
    [issues],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveIssue(null);
      const { active, over } = event;
      if (!over) return;

      const targetColumnId = String(over.id);
      const draggedIssue = issues.find((i: KanbanIssue) => i.id === active.id);
      if (!draggedIssue || draggedIssue.state === targetColumnId) return;

      moveIssue(String(active.id), targetColumnId);
    },
    [issues, moveIssue],
  );

  const handleCreate = useCallback(
    async (title: string, state: string) => {
      await addIssue(title, state);
    },
    [addIssue],
  );

  const visibleColumnDefs = COLUMNS.filter((c: { id: string }) => visibleColumns.includes(c.id));

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-0 p-5 min-h-full" style={{ minWidth: `${visibleColumnDefs.length * 316}px` }}>
              {visibleColumnDefs.map((col: { id: string; label: string; color: string }) => (
                <KanbanColumn
                  key={col.id}
                  columnId={col.id}
                  issues={issues.filter((i: KanbanIssue) => i.state === col.id)}
                  onCreateClick={setCreateColumn}
                />
              ))}
            </div>
          </div>

          <HiddenColumns visibleColumns={visibleColumns} onToggle={toggleColumn} />
        </div>

        <DragOverlay>
          {activeIssue && (
            <div className="rotate-2 opacity-90">
              <TaskCard issue={activeIssue} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        columnId={createColumn ?? ""}
        open={createColumn !== null}
        onClose={() => setCreateColumn(null)}
        onCreate={handleCreate}
      />
    </>
  );
}
