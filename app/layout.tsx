import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WMS — Inventory",
  description: "Warehouse inventory tracking",
  other: {
     "color-scheme":"dark",
	},
};

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
  // { href: "/analytics", label: "Analytics" },
  { href: "/stock-opname", label: "Stock Opname" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <div className="min-h-screen flex">
          <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
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
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
