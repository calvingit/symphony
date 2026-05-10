"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { ProjectRecord, ProjectWorkspace } from "../lib/graphql";

interface ProjectsDialogProps {
  open: boolean;
  projects: ProjectRecord[];
  onClose: () => void;
  onCreate: (input: { slugId: string; name: string; workspace: ProjectWorkspace }) => Promise<void>;
  onUpdate: (
    slugId: string,
    input: { name?: string; workspace?: ProjectWorkspace },
  ) => Promise<void>;
  onDelete: (slugId: string) => Promise<void>;
}

type FormState = {
  slugId: string;
  name: string;
  kind: "local" | "remote";
  localPath: string;
  remoteUrl: string;
  baseBranch: string;
};

const EMPTY_FORM: FormState = {
  slugId: "",
  name: "",
  kind: "local",
  localPath: "",
  remoteUrl: "",
  baseBranch: "main",
};

function toDefaultSlug(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

export function ProjectsDialog({
  open,
  projects,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: ProjectsDialogProps) {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const editingProject = useMemo(
    () => projects.find((project) => project.slugId === editingSlug) ?? null,
    [projects, editingSlug],
  );
  const defaultSlug = useMemo(() => toDefaultSlug(form.name), [form.name]);
  const canSubmit =
    Boolean(form.name.trim()) &&
    Boolean(editingProject ? form.slugId.trim() : form.slugId.trim() || defaultSlug) &&
    Boolean(form.baseBranch.trim()) &&
    (form.kind === "local" ? Boolean(form.localPath.trim()) : Boolean(form.remoteUrl.trim()));

  useEffect(() => {
    if (!open) {
      setEditingSlug(null);
      setForm(EMPTY_FORM);
      setSubmitting(false);
      return;
    }
    if (!editingProject) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      slugId: editingProject.slugId,
      name: editingProject.name,
      kind: editingProject.workspace.kind,
      localPath: editingProject.workspace.localPath ?? "",
      remoteUrl: editingProject.workspace.remoteUrl ?? "",
      baseBranch: editingProject.workspace.baseBranch ?? "main",
    });
  }, [editingProject, open]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const slugId = editingProject ? form.slugId.trim() : form.slugId.trim() || defaultSlug;
    const name = form.name.trim();
    const baseBranch = form.baseBranch.trim();
    if (!slugId || !name || !baseBranch) return;
    const workspace: ProjectWorkspace =
      form.kind === "local"
        ? {
            kind: "local",
            localPath: form.localPath.trim() || null,
            remoteUrl: null,
            baseBranch,
          }
        : {
            kind: "remote",
            localPath: null,
            remoteUrl: form.remoteUrl.trim() || null,
            baseBranch,
          };
    setSubmitting(true);
    try {
      if (editingProject) {
        await onUpdate(editingProject.slugId, { name, workspace });
      } else {
        await onCreate({ slugId, name, workspace });
      }
      setEditingSlug(null);
      setForm(EMPTY_FORM);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-5xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Projects</h2>
            <p className="mt-1 text-xs text-gray-500">Manage project workspaces and repo sources.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
          <div className="border-r border-gray-200 p-5">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Existing projects
            </div>

            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.slugId}
                  className="rounded-lg border border-gray-200 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{project.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{project.slugId}</div>
                      <div className="mt-2 text-xs text-gray-600">
                        {project.workspace.kind === "local"
                          ? project.workspace.localPath || "Local repo path missing"
                          : project.workspace.remoteUrl || "Remote URL missing"}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        Base branch: {project.workspace.baseBranch || "main"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingSlug(project.slugId)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void onDelete(project.slugId)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              {editingProject ? `Edit ${editingProject.slugId}` : "Create project"}
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Project name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  placeholder="Symphony Local"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Project slug</span>
                <input
                  type="text"
                  value={form.slugId}
                  disabled={Boolean(editingProject)}
                  onChange={(event) => setForm((current) => ({ ...current, slugId: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={defaultSlug || "symphony-local"}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Workspace type</span>
                <select
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value === "remote" ? "remote" : "local",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="local">Local git repo</option>
                  <option value="remote">Remote git repo</option>
                </select>
              </label>

              {form.kind === "local" ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Local repo path</span>
                  <input
                    type="text"
                    value={form.localPath}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, localPath: event.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/Users/me/src/repo"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Remote URL</span>
                  <input
                    type="text"
                    value={form.remoteUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, remoteUrl: event.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="git@github.com:owner/repo.git"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Default branch</span>
                <input
                  type="text"
                  value={form.baseBranch}
                  onChange={(event) => setForm((current) => ({ ...current, baseBranch: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="main"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSlug(null);
                    setForm(EMPTY_FORM);
                  }}
                  className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={submitting || !canSubmit}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editingProject ? "Save project" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
