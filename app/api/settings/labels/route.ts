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

type RawLabel = { en: string; id: string; zh: string };

// GET /api/settings/labels?page=stock_opname
// Returns every customizable key for the page as { en, id, zh }. English
// falls back to the compiled-in default when there's no override; id/zh
// are empty strings until someone fills them in — the reading side
// (usePageLabels) is what falls back to English when a translation for
// the currently selected language is missing.
export async function GET(req: NextRequest) {
  const page = sanitize(req.nextUrl.searchParams.get("page") ?? "");

  if (!isValidPage(page)) {
    return NextResponse.json({ error: "Unknown or unsupported page" }, { status: 400 });
  }

  const overrides = await db.select().from(pageLabels).where(eq(pageLabels.page, page));
  const overrideByKey = new Map(overrides.map((r) => [r.key, r]));

  const result: Record<string, RawLabel> = {};
  for (const [key, defaultEn] of Object.entries(DEFAULT_LABELS[page])) {
    const override = overrideByKey.get(key);
    result[key] = {
      en: override?.textEn || defaultEn,
      id: override?.textId ?? "",
      zh: override?.textZh ?? "",
    };
  }

  return NextResponse.json(result);
}

// PUT /api/settings/labels
// body: { page, labels: { key: { en, id, zh } } }
// Upserts all three language fields for every provided key. Leaving a
// field blank and saving clears that override — English then falls back
// to the compiled-in default, id/zh fall back to whatever English
// resolves to (handled on the reading side, not stored here).
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
  const entries = Object.entries(labels as Record<string, Partial<RawLabel>>).filter(([key]) =>
    validKeys.has(key)
  );

  if (entries.length === 0) {
    return NextResponse.json({ error: "No recognized label keys for this page" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      const textEn = sanitize(value.en ?? "");
      const textId = sanitize(value.id ?? "");
      const textZh = sanitize(value.zh ?? "");

      const [existing] = await tx
        .select()
        .from(pageLabels)
        .where(and(eq(pageLabels.page, page), eq(pageLabels.key, key)));

      if (existing) {
        await tx
          .update(pageLabels)
          .set({
            textEn: textEn || null,
            textId: textId || null,
            textZh: textZh || null,
            updatedAt: new Date(),
          })
          .where(eq(pageLabels.id, existing.id));
      } else {
        await tx.insert(pageLabels).values({
          page,
          key,
          textEn: textEn || null,
          textId: textId || null,
          textZh: textZh || null,
        });
      }
    }
  });

  return NextResponse.json({ saved: entries.length });
}