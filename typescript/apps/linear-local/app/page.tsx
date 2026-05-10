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
    loadProjects,
    loadIssues,
    loadRuns,
    projects,
    selectedProjectSlug,
    selectProject,
  } = useKanbanStore();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectsResolved, setProjectsResolved] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectFromUrl = searchParams.get("project");
  const requiresProject = projectsResolved && projects.length === 0;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadProjects();
      } finally {
        if (!cancelled) {
          setProjectsResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectsResolved) {
      return;
    }
    if (!projectFromUrl || projectFromUrl === selectedProjectSlug) {
      return;
    }
    selectProject(projectFromUrl);
  }, [projectFromUrl, projectsResolved, selectedProjectSlug, selectProject]);

  const hasProjectInList = useMemo(
    () =>
      projectFromUrl
        ? projects.some((project) => project.slugId === projectFromUrl)
        : false,
    [projectFromUrl, projects],
  );

  useEffect(() => {
    if (!projectsResolved) {
      return;
    }
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
    projectsResolved,
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
      {!projectsResolved ? (
        <ProjectsLoadingState />
      ) : (
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
      )}
    </div>
  );
}

function ProjectsLoadingState() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
        Loading projects...
      </div>
    </main>
  );
}

function PageShell() {
  return <div className="h-screen bg-[#f7f7f7]" />;
}
