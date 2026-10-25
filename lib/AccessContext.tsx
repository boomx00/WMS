"use client";

// Makes the logged-in user's page/action access available to any client
// component: `const can = useCan(); if (can("so.create")) ...`.
// UI only — the API routes enforce the same rules on their own.

import { createContext, useCallback, useContext } from "react";
import { canDo, type ActionKey, type PageAccess } from "@/lib/pages";

const AccessContext = createContext<PageAccess | null>(null);

export function AccessProvider({ access, children }: { access: PageAccess | null; children: React.ReactNode }) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): PageAccess | null {
  return useContext(AccessContext);
}

export function useCan(): (key: ActionKey) => boolean {
  const access = useContext(AccessContext);
  return useCallback((key: ActionKey) => canDo(access, key), [access]);
}
