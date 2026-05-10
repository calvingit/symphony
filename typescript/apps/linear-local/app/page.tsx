"use client";

import { useState } from "react";
import { Navbar } from "../components/Navbar";
import { KanbanBoard } from "../components/KanbanBoard";
import { useKanbanStore } from "../lib/store";

export default function Page() {
  const { isLoading, loadIssues, projects, selectedProjectSlug, selectProject } = useKanbanStore();
  const [projectsOpen, setProjectsOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-[#f7f7f7]">
      <Navbar
        onRefresh={loadIssues}
        isLoading={isLoading}
        projects={projects}
        selectedProjectSlug={selectedProjectSlug}
        onProjectChange={selectProject}
        onManageProjects={() => setProjectsOpen(true)}
      />
      <KanbanBoard projectsOpen={projectsOpen} onProjectsClose={() => setProjectsOpen(false)} />
    </div>
  );
}
