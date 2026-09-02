"use client";

import { useState } from "react";

const navItems = [
  { href: "/", label: "Inventory" },
  { href: "/location-stock", label: "Location Stock (v2)" },
  { href: "/sales-orders", label: "Sales Orders" },
  { href: "/movement-history-v2", label: "Movement History (v2)" },
  // { href: "/rack-contents", label: "Location Contents" },
  // { href: "/default-stock", label: "Default Stock" },
  // { href: "/pallets", label: "Pallets" },
  { href: "/locations", label: "Locations" },
  { href: "/items", label: "Items" },
  { href: "/work-orders", label: "Work Orders" },
  { href: "/users", label: "Users" },
  { href: "/roles", label: "Roles" },
  // { href: "/transactions", label: "History" },
  { href: "/scan", label: "Scan" },
  // { href: "/pending", label: "Pending" },
  { href: "/analytics", label: "Analytics" },
  { href: "/stock-opname", label: "Stock Opname" },
  { href: "/settings", label: "Settings" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar. `sticky top-0` + its own height/scroll keeps it
          pinned in the viewport instead of scrolling away with the page
          — previously it had no sticky positioning, so its actual nav
          links (not just the tall background box) scrolled out of view
          on long pages. */}
      <aside className="hidden md:flex w-56 shrink-0 h-screen sticky top-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <div className="font-mono text-xs tracking-widest text-amber-500 uppercase">
            Rack&nbsp;/&nbsp;Bin
          </div>
          <div className="text-lg font-semibold mt-0.5">WMS</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-zinc-800 text-xs text-zinc-600 font-mono">
          v0.1 · inventory
        </div>
      </aside>

      {/* Mobile top bar with a dropdown menu, shown below the md breakpoint
          instead of the sidebar. Also sticky, so it stays visible on scroll. */}
      <div className="md:hidden sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-amber-500 uppercase">
              Rack&nbsp;/&nbsp;Bin
            </div>
            <div className="text-base font-semibold -mt-0.5">WMS</div>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {open && (
          <nav className="border-t border-zinc-800 px-3 py-3 space-y-1 max-h-[calc(100vh-57px)] overflow-y-auto">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}