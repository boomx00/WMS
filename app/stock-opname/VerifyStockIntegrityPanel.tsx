"use client";

import { useState } from "react";
import CombineCsoPanel from "./CombineCsoPanel";
import ExcelVerifyPanel from "./ExcelVerifyPanel";

export default function VerifyStockIntegrityPanel() {
  const [subTab, setSubTab] = useState<"combine" | "excel">("combine");

  return (
    <div>
      <h1>SSSSSSSSSSSSSSSS</h1>
      <CombineCsoPanel /> 
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