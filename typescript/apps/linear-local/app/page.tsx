"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "../components/Navbar";
import { KanbanBoard } from "../components/KanbanBoard";
import { useKanbanStore } from "../lib/store";

export default function Page() {
  return (
    <Suspense fallback={<PageShell />}>
      <IssuesPageContent />
    </Suspense>
  );
}

function IssuesPageContent() {
  const {
    isLoading,
    loadIssues,
    loadRuns,
    projects,
    selectedProjectSlug,
    selectProject,
  } = useKanbanStore();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectFromUrl = searchParams.get("project");
  const requiresProject = projects.length === 0;

  useEffect(() => {
    if (!projectFromUrl || projectFromUrl === selectedProjectSlug) {
      return;
    }
    selectProject(projectFromUrl);
  }, [projectFromUrl, selectedProjectSlug, selectProject]);

  const hasProjectInList = useMemo(
    () =>
      projectFromUrl
        ? projects.some((project) => project.slugId === projectFromUrl)
        : false,
    [projectFromUrl, projects],
  );

  useEffect(() => {
    if (projects.length === 0 || !selectedProjectSlug) {
      return;
    }
    if (projectFromUrl === selectedProjectSlug) {
      return;
    }
    if (projectFromUrl && hasProjectInList) {
      return;
    }
    router.replace(
      `${pathname}?project=${encodeURIComponent(selectedProjectSlug)}`,
      { scroll: false },
    );
  }, [
    hasProjectInList,
    pathname,
    projectFromUrl,
    projects.length,
    router,
    selectedProjectSlug,
  ]);

  const handleRefresh = () => {
    void loadIssues();
    loadRuns();
  };

  return (
    <div className="h-screen flex flex-col bg-[#f7f7f7]">
      <Navbar
        activeView="issues"
        onRefresh={handleRefresh}
        isLoading={isLoading}
        projects={projects}
        selectedProjectSlug={selectedProjectSlug}
        onProjectChange={selectProject}
        onManageProjects={() => setProjectsOpen(true)}
      />
      <KanbanBoard
        projectsOpen={requiresProject || projectsOpen}
        projectsRequired={requiresProject}
        onProjectsClose={() => {
          if (requiresProject) {
            return;
          }
          setProjectsOpen(false);
        }}
      />
    </div>
  );
}

function PageShell() {
  return <div className="h-screen bg-[#f7f7f7]" />;
}
