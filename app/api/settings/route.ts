import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET() {
  const [row] = await db.select().from(settings).limit(1);
  return NextResponse.json(
    row ?? {
      allowDefaultCodeTransactions: true,
      automaticInbound: false,
      automaticInboundFromRack: false,
      allowUntrackedOutbound: false,
      allowDefaultPicking: true,
      allowNegativeFloorStock: false,
      allowNegativeRackStock: false,
    }
  );
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const {
    allowDefaultCodeTransactions,
    automaticInbound,
    automaticInboundFromRack,
    allowUntrackedOutbound,
    allowDefaultPicking,
    allowNegativeFloorStock,
    allowNegativeRackStock,
  } = body;

  const [existing] = await db.select().from(settings).limit(1);

  const updates: Record<string, boolean> = {};
  if (allowDefaultCodeTransactions !== undefined) updates.allowDefaultCodeTransactions = allowDefaultCodeTransactions;
  if (automaticInbound !== undefined) updates.automaticInbound = automaticInbound;
  if (automaticInboundFromRack !== undefined) updates.automaticInboundFromRack = automaticInboundFromRack;
  if (allowUntrackedOutbound !== undefined) updates.allowUntrackedOutbound = allowUntrackedOutbound;
  if (allowDefaultPicking !== undefined) updates.allowDefaultPicking = allowDefaultPicking;
  if (allowNegativeFloorStock !== undefined) updates.allowNegativeFloorStock = allowNegativeFloorStock;
  if (allowNegativeRackStock !== undefined) updates.allowNegativeRackStock = allowNegativeRackStock;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No recognized settings fields in request body" }, { status: 400 });
  }

  let result;
  if (existing) {
    [result] = await db
      .update(settings)
      .set(updates)
      .where(eq(settings.id, existing.id))
      .returning();
  } else {
    [result] = await db
      .insert(settings)
      .values({
        allowDefaultCodeTransactions: allowDefaultCodeTransactions ?? true,
        automaticInbound: automaticInbound ?? false,
        automaticInboundFromRack: automaticInboundFromRack ?? false,
        allowUntrackedOutbound: allowUntrackedOutbound ?? false,
        allowDefaultPicking: allowDefaultPicking ?? true,
        allowNegativeFloorStock: allowNegativeFloorStock ?? false,
        allowNegativeRackStock: allowNegativeRackStock ?? false,
      })
      .returning();
  }

  return NextResponse.json(result);
}