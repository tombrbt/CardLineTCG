import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function splitFamilies(feature: string) {
  // "Quatre Empereurs/Équipage du Roux" -> ["Quatre Empereurs", "Équipage du Roux"]
  return feature
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const set = url.searchParams.get("set")?.trim(); // ex: OP-09 (optionnel)

  const where: any = {
    feature: { not: null },
  };

  if (set) {
    where.set = { code: set };
  }

  // On récupère UNIQUEMENT feature (plus léger)
  const rows = await prisma.card.findMany({
    where,
    select: { feature: true },
    distinct: ["feature"],
  });

  const familiesSet = new Set<string>();

  for (const r of rows) {
    if (!r.feature) continue;
    for (const fam of splitFamilies(r.feature)) {
      familiesSet.add(fam);
    }
  }

  const families = Array.from(familiesSet).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );

  return NextResponse.json({ success: true, families });
}