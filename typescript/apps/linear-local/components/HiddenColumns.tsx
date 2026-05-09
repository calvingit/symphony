"use client";

import { useState } from "react";
import { ChevronRight, EyeOff } from "lucide-react";
import { COLUMNS } from "../lib/store";

interface HiddenColumnsProps {
  visibleColumns: string[];
  onToggle: (columnId: string) => void;
}

export function HiddenColumns({ visibleColumns, onToggle }: HiddenColumnsProps) {
  const [expanded, setExpanded] = useState(false);
  const hidden = COLUMNS.filter((c: { id: string; label: string; color: string }) => !visibleColumns.includes(c.id));

  if (hidden.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-l border-gray-200 bg-gray-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 w-full"
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span>Hidden columns</span>
        <span className="text-gray-400">({hidden.length})</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {hidden.map((col: { id: string; label: string; color: string }) => (
            <button
              key={col.id}
              onClick={() => onToggle(col.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
            >
              <EyeOff className="w-3 h-3" />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <span>{col.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
