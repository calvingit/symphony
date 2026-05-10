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
import { ProjectsDialog } from "./ProjectsDialog";
import { IssueDetailsDialog } from "./IssueDetailsDialog";
import { useKanbanStore, COLUMNS } from "../lib/store";
import type { KanbanIssue } from "../lib/graphql";

export function KanbanBoard(props: {
  projectsOpen: boolean;
  projectsRequired: boolean;
  onProjectsClose: () => void;
}) {
  const {
    projects,
    selectedProjectSlug,
    issues,
    visibleColumns,
    runs,
    runEvents,
    selectedIssueId,
    issueDetailsById,
    issueDetailsLoading,
    issueDetailsError,
    loadIssues,
    loadRuns,
    openIssueDetails,
    closeIssueDetails,
    moveIssue,
    addIssue,
    addProject,
    editProject,
    removeProject,
    toggleColumn,
  } = useKanbanStore();

  const [activeIssue, setActiveIssue] = useState<KanbanIssue | null>(null);
  const [createColumn, setCreateColumn] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!selectedProjectSlug) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadIssues({ silent: true });
      void loadRuns();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadIssues, loadRuns, selectedProjectSlug]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues, selectedProjectSlug]);

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
    async (input: {
      title: string;
      description: string;
      state: string;
      priority: import("@symphony/core").IssuePriority | null;
      branchName: string | null;
      labels: string[];
    }) => {
      await addIssue(input);
    },
    [addIssue],
  );

  const visibleColumnDefs = COLUMNS.filter((c: { id: string }) => visibleColumns.includes(c.id));
  const selectedProject =
    projects.find((project) => project.slugId === selectedProjectSlug) ?? null;
  const selectedIssue = selectedIssueId ? issueDetailsById[selectedIssueId] ?? null : null;

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
                  runs={runs}
                  onCreateClick={setCreateColumn}
                  onIssueClick={(issue) => {
                    void openIssueDetails(issue.id);
                  }}
                />
              ))}
            </div>
          </div>

          <HiddenColumns visibleColumns={visibleColumns} onToggle={toggleColumn} />
        </div>

        <DragOverlay>
          {activeIssue && (
            <div className="rotate-2 opacity-90">
              <TaskCard issue={activeIssue} run={runs[activeIssue.id]} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        columnId={createColumn ?? ""}
        projectName={selectedProject?.name ?? null}
        open={createColumn !== null}
        onClose={() => setCreateColumn(null)}
        onCreate={handleCreate}
      />

      <ProjectsDialog
        open={props.projectsOpen}
        projects={projects}
        required={props.projectsRequired}
        onClose={props.onProjectsClose}
        onCreate={addProject}
        onUpdate={editProject}
        onDelete={removeProject}
      />

      <IssueDetailsDialog
        issue={selectedIssue}
        issueId={selectedIssueId}
        run={selectedIssueId ? runs[selectedIssueId] : undefined}
        runEvents={selectedIssueId ? runEvents.filter((event) => event.issueId === selectedIssueId) : []}
        isLoading={issueDetailsLoading}
        error={issueDetailsError}
        onClose={closeIssueDetails}
      />
    </>
  );
}
