"use client";

import { Navbar } from "../components/Navbar";
import { KanbanBoard } from "../components/KanbanBoard";
import { useKanbanStore } from "../lib/store";

export default function Page() {
  const { isLoading, loadIssues } = useKanbanStore();

  return (
    <div className="h-screen flex flex-col bg-[#f7f7f7]">
      <Navbar onRefresh={loadIssues} isLoading={isLoading} />
      <KanbanBoard />
    </div>
  );
}
