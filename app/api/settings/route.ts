import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pageLabels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { DEFAULT_LABELS, PageKey } from "@/lib/pageLabels";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function isValidPage(page: string): page is PageKey {
  return page in DEFAULT_LABELS;
}

// GET /api/settings/labels?page=stock_opname
// Returns the full label set for a page — defaults, with any saved
// overrides applied on top. The client never has to know which keys are
// customized vs default; it just gets the final text to render.
export async function GET(req: NextRequest) {
  const page = sanitize(req.nextUrl.searchParams.get("page") ?? "");

  if (!isValidPage(page)) {
    return NextResponse.json({ error: "Unknown or unsupported page" }, { status: 400 });
  }

  const overrides = await db.select().from(pageLabels).where(eq(pageLabels.page, page));

  const merged: Record<string, string> = { ...DEFAULT_LABELS[page] };
  for (const row of overrides) {
    merged[row.key] = row.value;
  }

  return NextResponse.json(merged);
}

// PUT /api/settings/labels
// body: { page, labels: { key: value, ... } }
// Upserts every provided key for that page. A value equal to the default
// is still stored as an explicit override (simplest, most predictable
// behavior) — use DELETE to actually reset a key back to following
// future default changes automatically.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const page = sanitize(body.page ?? "");
  const labels = body.labels;

  if (!isValidPage(page) || typeof labels !== "object" || labels === null) {
    return NextResponse.json({ error: "page and a labels object are required" }, { status: 400 });
  }

  const validKeys = new Set(Object.keys(DEFAULT_LABELS[page]));
  const entries = Object.entries(labels).filter(([key]) => validKeys.has(key));

  if (entries.length === 0) {
    return NextResponse.json({ error: "No recognized label keys for this page" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      const cleanValue = sanitize(String(value ?? ""));
      const [existing] = await tx
        .select()
        .from(pageLabels)
        .where(and(eq(pageLabels.page, page), eq(pageLabels.key, key)));

      if (existing) {
        await tx
          .update(pageLabels)
          .set({ value: cleanValue, updatedAt: new Date() })
          .where(eq(pageLabels.id, existing.id));
      } else {
        await tx.insert(pageLabels).values({ page, key, value: cleanValue });
      }
    }
  });

  return NextResponse.json({ saved: entries.length });
}

// DELETE /api/settings/labels
// body: { page, key }
// Removes a single override, reverting that one string back to whatever
// DEFAULT_LABELS says (including any future code changes to the default).
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const page = sanitize(body.page ?? "");
  const key = sanitize(body.key ?? "");

  if (!isValidPage(page) || !key) {
    return NextResponse.json({ error: "page and key are required" }, { status: 400 });
  }

  await db.delete(pageLabels).where(and(eq(pageLabels.page, page), eq(pageLabels.key, key)));

  return NextResponse.json({ reverted: key });
}