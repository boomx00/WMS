"use client";

import { useState } from "react";
import CombineCsoPanel from "./CombineCsoPanel";
import ExcelVerifyPanel from "./ExcelVerifyPanel";

export default function VerifyStockIntegrityPanel() {
  const [subTab, setSubTab] = useState<"combine" | "excel">("combine");

  return (
    <div>
      <div className="flex gap-2 mb-5">
        <SubTabButton label="Combine CSO" active={subTab === "combine"} onClick={() => setSubTab("combine")} />
        <SubTabButton label="Excel Upload" active={subTab === "excel"} onClick={() => setSubTab("excel")} />
      </div>
      {subTab === "combine" ? <CombineCsoPanel /> : <ExcelVerifyPanel />}
    </div>
  );
}

function SubTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
        active ? "bg-amber-500 text-zinc-950 font-medium" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}