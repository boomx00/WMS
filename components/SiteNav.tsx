"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { LANGUAGE_OPTIONS } from "@/lib/pageLabels";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

const navItems = [
  { href: "/", label: "Inventory" },
  { href: "/location-stock", label: "Location Stock (v2)" },
  { href: "/sales-orders", label: "Sales Orders" },
  { href: "/movement-history-v2", label: "Movement History (v2)" },
  // { href: "/rack-contents", label: "Location Contents" },
  // { href: "/default-stock", label: "Default Stock" },
  // { href: "/pallets", label: "Pallets" },
  { href: "/work-orders", label: "Work Orders" },
  // { href: "/transactions", label: "History" },
  { href: "/scan", label: "System Control" },
  // { href: "/pending", label: "Pending" },
  { href: "/analytics", label: "Analytics" },
  { href: "/stock-opname", label: "Stock Opname" },
  { href: "/settings", label: "Settings" },
];

type NavItems =
  | "Inventory"
  | "Location_Stock"
  | "Sales_Orders"
  | "Movement_History"
  | "Work_Orders"
  | "System_Control"
  | "Analytics"
  | "Stock_Opname"
  | "Settings";



const adminItems = [
  { href: "/items", label: "Items" },
  { href: "/locations", label: "Locations" },
  { href: "/users", label: "Users" },
  { href: "/roles", label: "Roles" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const labels = usePageLabels("navbar")
console.log("navbar labels:", labels);
  const navItem:{key: NavItems; label: string, href: string}[] = [
    {key: "Inventory", label: labels.inventory, href:"/"},
    {key: "Location_Stock", label: labels.location_stock, href:"/location-stock"},
    {key: "Sales_Orders", label: labels.sales_order, href:"/sales-orders"},
    {key: "Movement_History", label: labels.movement_history, href:"/movement-history-v2"},
    {key: "Work_Orders", label: labels.work_order, href:"/work-orders"},
    {key: "System_Control", label: labels.system_control, href:"/scan"},
    {key: "Analytics", label: labels.analytics, href:"/analytics"},
    {key: "Stock_Opname", label: labels.stock_opname, href:"/stock-opname"},
    {key: "Settings", label: labels.settings, href:"/settings"},
  ]

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 h-screen sticky top-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <div className="font-mono text-xs tracking-widest text-amber-500 uppercase">
            Rack&nbsp;/&nbsp;Bin
          </div>

          <div className="flex items-center justify-between mt-0.5">
            <div className="text-lg font-semibold">WMS</div>

            <LanguageSwitcher
              language={language}
              onChange={setLanguage}
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {/* Main navigation */}
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              {item.label}
            </a>
          ))}

          {/* Administration dropdown */}
          <div>
            <button
              onClick={() => setAdminOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              <span>Administration</span>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${
                  adminOpen ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6 9 6 6 6-6"
                />
              </svg>
            </button>

            {adminOpen && (
              <div className="ml-3 mt-1 space-y-1 border-l border-zinc-800 pl-2">
                {adminItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block px-3 py-2 rounded-md text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-zinc-800 text-xs text-zinc-600 font-mono">
          v0.1 · inventory
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-amber-500 uppercase">
              Rack&nbsp;/&nbsp;Bin
            </div>

            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">WMS</div>

              <LanguageSwitcher
                language={language}
                onChange={setLanguage}
              />
            </div>
          </div>

          <button
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            className="p-2 rounded-md text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            {open ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {open && (
          <nav className="border-t border-zinc-800 px-3 py-3 space-y-1 max-h-[calc(100vh-57px)] overflow-y-auto">
            {/* Main navigation */}
            {navItem.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                {item.label}
              </a>
            ))}

            {/* Administration dropdown */}
            <div>
              <button
                onClick={() => setAdminOpen((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                <span>Administration</span>

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 transition-transform ${
                    adminOpen ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m6 9 6 6 6-6"
                  />
                </svg>
              </button>

              {adminOpen && (
                <div className="ml-3 mt-1 space-y-1 border-l border-zinc-800 pl-2">
                  {adminItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 rounded-md text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

function LanguageSwitcher({
  language,
  onChange,
}: {
  language: "en" | "id" | "zh";
  onChange: (lang: "en" | "id" | "zh") => void;
}) {
  return (
    <select
      value={language}
      onChange={(e) =>
        onChange(e.target.value as "en" | "id" | "zh")
      }
      aria-label="Language"
      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-amber-500"
    >
      {LANGUAGE_OPTIONS.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

