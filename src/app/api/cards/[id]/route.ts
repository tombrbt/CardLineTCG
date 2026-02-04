import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const cardId = Number(id);
  if (!Number.isFinite(cardId)) {
    return NextResponse.json(
      { success: false, error: "Invalid id" },
      { status: 400 }
    );
  }

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { set: true, aliases: true, rulings: true, price: true},
  });

  if (!card) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, card });
}