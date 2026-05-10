"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "../../components/Navbar";
import { OverviewDashboard } from "../../components/OverviewDashboard";
import { ProjectsDialog } from "../../components/ProjectsDialog";
import { useKanbanStore } from "../../lib/store";

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageShell />}>
      <OverviewPageContent />
    </Suspense>
  );
}

function OverviewPageContent() {
  const {
    addProject,
    editProject,
    isLoading,
    issues,
    loadIssues,
    loadProjects,
    loadRuns,
    projects,
    removeProject,
    runs,
    selectedProjectSlug,
    selectProject,
  } = useKanbanStore();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectFromUrl = searchParams.get("project");

  useEffect(() => {
    void loadProjects();
    loadRuns();
    const timer = window.setInterval(() => {
      void loadProjects();
      loadRuns();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadProjects, loadRuns]);

  useEffect(() => {
    if (!projectFromUrl || projectFromUrl === selectedProjectSlug) {
      return;
    }
    selectProject(projectFromUrl);
  }, [projectFromUrl, selectedProjectSlug, selectProject]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues, selectedProjectSlug]);

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

  const selectedProject =
    projects.find((project) => project.slugId === selectedProjectSlug) ?? null;

  const handleRefresh = () => {
    void loadProjects();
    void loadIssues();
    loadRuns();
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Navbar
        activeView="overview"
        onRefresh={handleRefresh}
        isLoading={isLoading}
        projects={projects}
        selectedProjectSlug={selectedProjectSlug}
        onProjectChange={selectProject}
        onManageProjects={() => setProjectsOpen(true)}
      />
      <OverviewDashboard
        isLoading={isLoading}
        issues={issues}
        project={selectedProject}
        runs={runs}
      />
      <ProjectsDialog
        open={projectsOpen}
        projects={projects}
        onClose={() => setProjectsOpen(false)}
        onCreate={addProject}
        onUpdate={editProject}
        onDelete={removeProject}
      />
    </div>
  );
}

function PageShell() {
  return <div className="min-h-screen bg-[#f7f7f7]" />;
}
