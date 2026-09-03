import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import { LanguageProvider } from "@/lib/LanguageContext";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <LanguageProvider>
          {/* flex-col on mobile: mobile top bar (from SiteNav) stacks above
              the page content. flex-row on desktop: sidebar sits beside it,
              as before. */}
          <div className="min-h-screen flex flex-col md:flex-row">
            <SiteNav />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}