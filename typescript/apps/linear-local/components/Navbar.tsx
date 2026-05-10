"use client";

import { FolderGit2, RefreshCw } from "lucide-react";
import type { ProjectRecord } from "../lib/graphql";

interface NavbarProps {
  onRefresh: () => void;
  isLoading: boolean;
  projects: ProjectRecord[];
  selectedProjectSlug: string | null;
  onProjectChange: (slugId: string) => void;
  onManageProjects: () => void;
}

export function Navbar({
  onRefresh,
  isLoading,
  projects,
  selectedProjectSlug,
  onProjectChange,
  onManageProjects,
}: NavbarProps) {
  return (
    <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">Symphony Local</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Overview</span>
          <span className="text-sm text-gray-900 font-medium">Issues</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedProjectSlug ?? ""}
          onChange={(event) => onProjectChange(event.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700"
        >
          {projects.map((project) => (
            <option key={project.slugId} value={project.slugId}>
              {project.name}
            </option>
          ))}
        </select>
        <button
          onClick={onManageProjects}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span>Projects</span>
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>{isLoading ? "Loading..." : "Refresh"}</span>
        </button>
      </div>
    </nav>
  );
}
