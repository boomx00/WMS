"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/LanguageContext";
import { LANGUAGE_OPTIONS } from "@/lib/pageLabels";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { canAccessPath, type PageAccess } from "@/lib/pages";
import { SO_TYPE_NAVBAR_LABELS } from "@/lib/salesOrderTypeLabels";

// const navItems = [
//   { href: "/", label: "Inventory" },
//   { href: "/location-stock", label: "Location Stock (v2)" },
//   { href: "/sales-orders", label: "Sales Orders" },
//   { href: "/movement-history-v2", label: "Movement History (v2)" },
//   // { href: "/rack-contents", label: "Location Contents" },
//   // { href: "/default-stock", label: "Default Stock" },
//   // { href: "/pallets", label: "Pallets" },
//   { href: "/work-orders", label: "Work Orders" },
//   // { href: "/transactions", label: "History" },
//   { href: "/scan", label: "System Control" },
//   // { href: "/pending", label: "Pending" },
//   { href: "/analytics", label: "Analytics" },
//   { href: "/stock-opname", label: "Stock Opname" },
//   { href: "/settings", label: "Settings" },
// ];

type NavItems =
  | "HeatMap"
  | "Location_Stock"
  | "Total_Stock"
  | "Sales_Orders"
  | "Sales_Order_List"
  | "Sales_Order_Types"
  | "Movement_History"
  | "Work_Orders"
  | "System_Control"
  | "Analytics"
  | "Stock_Opname"
  | "Settings"
  | "Other_Transactions"
  | "Master_Data"
  | "Item_List"
  | "Location_List"
  | "User_List"
  | "Role_List"
  | "Permissions"

type MasterItems = 
  | "Master_Data"
  | "Item_List"
  | "Location_List"
  | "User_List"
  | "Role_List"
  | "Permissions"

type NavLink = { key: NavItems; label: string; href: string }
// An entry with children is a dropdown (e.g. Sales Orders → list / types).
type NavEntry = NavLink & { children?: NavLink[] }

function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

const adminItems = [
  { href: "/items", label: "Items" },
  { href: "/locations", label: "Locations" },
  { href: "/users", label: "Users" },
  { href: "/roles", label: "Roles" },
  { href: "/permissions", label: "Permissions" },
];



export default function SiteNav({
  username,
  access,
}: {
  username: string | null;
  // null when logged out (login page) — nothing to filter then.
  access: PageAccess | null;
}) {
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const labels = usePageLabels("navbar", SO_TYPE_NAVBAR_LABELS)

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login"; // full reload so no stale state survives
  }
    // const adminItemNav:{key: MasterItems; label: string, href: string}[] = [
    //   {key:" Items", label: labels.items, href:"/"}
    // ]




  const navItem: NavEntry[] = [
    {key: "HeatMap", label: labels.heat_map, href:"/"},
    {key: "Location_Stock", label: labels.location_stock, href:"/location-stock"},
    {key: "Total_Stock", label: labels.total_stock, href:"/total-stock"},
    {key: "Sales_Orders", label: labels.sales_order, href:"/sales-orders", children: [
      {key: "Sales_Order_List", label: labels.sales_order_list, href:"/sales-orders"},
      {key: "Sales_Order_Types", label: labels.sales_order_types, href:"/sales-order-types"},
    ]},
    {key: "Movement_History", label: labels.movement_history, href:"/movement-history-v2"},
    {key: "Work_Orders", label: labels.work_order, href:"/work-orders"},
    {key: "System_Control", label: labels.system_control, href:"/scan"},
    {key: "Analytics", label: labels.analytics, href:"/analytics"},
    {key: "Stock_Opname", label: labels.stock_opname, href:"/stock-opname"},
    {key: "Other_Transactions", href: "/other-transactions", label: labels.other_transactions },
    {key: "Settings", label: labels.settings, href:"/settings"},
  ]

  const masterItem:{key: MasterItems; label: string, href: string}[]=[
    {key: "Master_Data", label: labels.master_data, href:""},
    {key: "Item_List", label: labels.item_list, href:"/items"},
    {key: "Location_List", label: labels.location_list, href:"/locations"},
    {key: "User_List", label: labels.user_list, href:"/users"},
    {key: "Role_List", label: labels.role_list, href:"/roles"},
    {key: "Permissions", label: labels.permissions, href:"/permissions"},
  ]

  const canSee = (href: string) => !access || canAccessPath(href, access)

  // A dropdown keeps only the children the role can open. With just one
  // left it's shown as a plain link; with none it's hidden.
  const visibleNavItems: NavEntry[] = navItem.flatMap((item): NavEntry[] => {
    if (!item.children) return canSee(item.href) ? [item] : []
    const children = item.children.filter((child) => canSee(child.href))
    if (children.length === 0) return []
    if (children.length === 1) return [{ key: item.key, label: item.label, href: children[0].href }]
    return [{ ...item, children }]
  })

  // Dropdowns start open when the current page is one of their children.
  const [openGroups, setOpenGroups] = useState<Set<NavItems>>(
    () =>
      new Set(
        navItem
          .filter((item) => item.children?.some((child) => isCurrent(pathname, child.href)))
          .map((item) => item.key)
      )
  )
  function toggleGroup(key: NavItems) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibleAdminItems = masterItem.filter((item) => !access || canAccessPath(item.href, access))

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 h-screen sticky top-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 flex-col">
        {username && (
  <div className="px-5 py-3 border-b border-zinc-800">
    <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
      Welcome,
    </div>
    <div className="text-sm font-semibold text-amber-500 uppercase truncate">
      {username}
    </div>
  </div>
)}
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
          {visibleNavItems.map((item) =>
            item.children ? (
              <NavDropdown
                key={item.key}
                label={item.label}
                items={item.children}
                open={openGroups.has(item.key)}
                onToggle={() => toggleGroup(item.key)}
              />
            ) : (
              <a
                key={item.key}
                href={item.href}
                className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                {item.label}
              </a>
            )
          )}

          {/* Administration dropdown — hidden if the role can't open any of it */}
          {visibleAdminItems.length > 0 && (
          <div>
            <button
              onClick={() => setAdminOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              <span>  {visibleAdminItems.find((item) => item.key === "Master_Data")?.label}
</span>

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
                {visibleAdminItems
                .filter((item) => item.key !== "Master_Data")
                .map((item) => (
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
          )}
        </nav>

      <div className="px-5 py-4 border-t border-zinc-800 space-y-3">
  {username && (
    <button
      onClick={handleLogout}
      className="w-full px-3 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
    >
      Log out
    </button>
  )}
  <div className="text-xs text-zinc-600 font-mono">v0.1 · inventory</div>
</div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1">
  <div className="font-mono text-[10px] tracking-widest text-amber-500 uppercase">
    Rack&nbsp;/&nbsp;Bin
  </div>

  <div className="flex items-center gap-2">
    <div className="text-base font-semibold">WMS</div>
    <LanguageSwitcher language={language} onChange={setLanguage} />
  </div>

  {username && (
    <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
      Welcome, <span className="text-amber-500 font-semibold">{username}</span>
    </div>
  )}
</div>

{username && (
  <button
    onClick={handleLogout}
    className="px-3 py-1.5 mr-1 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
  >
    Log out
  </button>
)}

{/* existing hamburger <button> stays as-is */}

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
            {visibleNavItems.map((item) =>
              item.children ? (
                <NavDropdown
                  key={item.key}
                  label={item.label}
                  items={item.children}
                  open={openGroups.has(item.key)}
                  onToggle={() => toggleGroup(item.key)}
                  onNavigate={() => setOpen(false)}
                />
              ) : (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
                >
                  {item.label}
                </a>
              )
            )}

            {/* Administration dropdown — hidden if the role can't open any of it */}
            {visibleAdminItems.length > 0 && (
            <div>
              <button
                onClick={() => setAdminOpen((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                <span>
                    {visibleAdminItems.find((item) => item.key === "Master_Data")?.label}
                </span>

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
               {visibleAdminItems
  .filter((item) => item.key !== "Master_Data")
  .map((item) => (
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
            )}
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

// A collapsible group in the nav, styled like Master Data.
function NavDropdown({
  label,
  items,
  open,
  onToggle,
  onNavigate,
}: {
  label: string;
  items: NavLink[];
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
      >
        <span>{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="ml-3 mt-1 space-y-1 border-l border-zinc-800 pl-2">
          {items.map((item) => (
            <a
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className="block px-3 py-2 rounded-md text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
