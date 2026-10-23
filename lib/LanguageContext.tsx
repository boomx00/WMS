"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { LANGUAGE_COOKIE, isLanguage, type Language, type LabelOverrides } from "@/lib/language";

export type { Language } from "@/lib/language";

const STORAGE_KEY = "wms_language";

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
  overrides: LabelOverrides;
}>({
  language: "en",
  setLanguage: () => {},
  overrides: {},
});

export function LanguageProvider({
  children,
  initialLanguage,
  overrides,
}: {
  children: React.ReactNode;
  // Read from the cookie by the root layout, so the server already renders
  // in the right language — no switch after mount.
  initialLanguage: Language;
  overrides: LabelOverrides;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  function setLanguage(lang: Language) {
    setLanguageState(lang);
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }

  // Keep <html lang> in sync when switching language without a reload —
  // the zh font scaling in globals.css keys off it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // One-time migration for users who picked a language back when it only
  // lived in localStorage: copy it into the cookie. After that the server
  // reads the cookie and this does nothing.
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${LANGUAGE_COOKIE}=`))) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (isLanguage(stored) && stored !== initialLanguage) setLanguage(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, overrides }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}