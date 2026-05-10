"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { normalizeLabels, type IssuePriority } from "@symphony/core";

interface CreateTaskDialogProps {
  columnId: string;
  projectName: string | null;
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    state: string;
    priority: IssuePriority | null;
    branchName: string | null;
    labels: string[];
  }) => Promise<void>;
}

const PRIORITY_OPTIONS: Array<{ value: IssuePriority | null; label: string }> = [
  { value: null, label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function CreateTaskDialog({
  columnId,
  projectName,
  open,
  onClose,
  onCreate,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority | null>(null);
  const [branchName, setBranchName] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority(null);
      setBranchName("");
      setPendingLabel("");
      setLabels([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: trimmed,
        description: description.trim(),
        state: columnId,
        priority,
        branchName: branchName.trim() || null,
        labels: normalizeLabels([...labels, pendingLabel]),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function addPendingLabel() {
    const [nextLabel] = normalizeLabels([pendingLabel]);
    if (!nextLabel) return;
    setLabels((current) => (current.includes(nextLabel) ? current : [...current, nextLabel]));
    setPendingLabel("");
  }

  function removeLabel(label: string) {
    setLabels((current) => current.filter((item) => item !== label));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {projectName ? `${projectName} · ` : ""}New task in {columnId}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Requirement description"
            rows={5}
            className="mt-3 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Priority</span>
              <select
                value={priority ?? ""}
                onChange={(e) => setPriority((e.target.value || null) as IssuePriority | null)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value ?? ""}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Branch</span>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feature/issue-branch"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-xs text-gray-500">Labels</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPendingLabel();
                  }
                }}
                placeholder="Add label"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addPendingLabel}
                className="rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >
                Add
              </button>
            </div>
            {labels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => removeLabel(label)}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200"
                  >
                    {label}
                    <span className="ml-1 text-gray-400">x</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
