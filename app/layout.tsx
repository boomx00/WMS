import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import { LanguageProvider } from "@/lib/LanguageContext";
import { getSession } from "@/lib/auth";
import { getPageAccess } from "@/lib/pagePermissions";
import { AccessProvider } from "@/lib/AccessContext";
import { LANGUAGE_COOKIE, isLanguage } from "@/lib/language";
import { getLabelOverrides } from "@/lib/pageLabelsServer";

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

async function getAccess() {
  const session = await getSession();
  const access = session ? await getPageAccess(session.userId) : null;
  return { session, access };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Labels don't depend on the session, so load them alongside the
  // session/permission lookups instead of after them.
  const [{ session, access }, labelOverrides, cookieStore] = await Promise.all([
    getAccess(),
    getLabelOverrides(),
    cookies(),
  ]);

  const cookieLang = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language = isLanguage(cookieLang) ? cookieLang : "en";

  return (
    <html
      lang={language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <LanguageProvider initialLanguage={language} overrides={labelOverrides}>
          <AccessProvider access={access}>
          {/* flex-col on mobile: mobile top bar (from SiteNav) stacks above
              the page content. flex-row on desktop: sidebar sits beside it,
              as before. */}
          <div className="min-h-screen flex flex-col md:flex-row">
            <SiteNav username={session?.username ?? null} access={access} />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
          </AccessProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}