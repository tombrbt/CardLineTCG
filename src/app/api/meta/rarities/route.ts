// app/api/meta/rarities/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RarityOption = { value: string; label: string };

const ELDERS_CODES = ["OP13-080", "OP13-083", "OP13-084", "OP13-089", "OP13-091"];
const RED_MANGA_CODES = ["OP13-118", "OP13-119", "OP13-120"];

const BASE_LABELS: Record<string, string> = {
  C: "Commune",
  UC: "Peu Commune",
  R: "Rare",
  SR: "Super Rare",
  L: "Leader",
  SEC: "Secrète",
  TR: "Treasure Rare",
  "SP CARD": "Spécial",
};

function sortOrder(value: string): number {
  // ordre stable dans le select
  const order = ["C", "UC", "R", "SR", "L", "SEC", "TR", "SP CARD", "ALTERNATIVE", "MANGA", "FIVE_ELDERS"];
  const idx = order.indexOf(value);
  return idx === -1 ? 999 : idx;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const set = url.searchParams.get("set")?.trim() || undefined;

  const where: any = {};
  if (set) where.set = { code: set };

  // On ne récupère que le strict nécessaire
  const rows = await prisma.card.findMany({
    where,
    select: { rarity: true, variant: true, code: true },
  });

  const base = new Set<string>();
  let hasAlternative = false;

  // Manga “classique” = variant p2 (hors TR/SP CARD) ET pas les Cinq Doyens
  let hasMangaP2 = false;

  // Red Manga OP-13 = variant p3 mais seulement pour 118/119/120
  let hasRedManga = false;

  // Cinq Doyens OP-13 = codes précis + variant p2
  let hasFiveElders = false;

  for (const r of rows) {
    const rarity = String(r.rarity ?? "").trim();
    const variant = String(r.variant ?? "base").trim();
    const code = String(r.code ?? "").toUpperCase().trim();

    if (rarity) base.add(rarity);

    if (variant === "p1" && rarity !== "TR" && rarity !== "SP CARD") {
      hasAlternative = true;
    }

    if (variant === "p2") {
      if (ELDERS_CODES.includes(code)) {
        hasFiveElders = true;
      } else if (rarity !== "TR" && rarity !== "SP CARD") {
        hasMangaP2 = true;
      }
    }

    if (variant === "p3" && RED_MANGA_CODES.includes(code)) {
      hasRedManga = true;
    }
  }

  // Construire les options
  const options: RarityOption[] = [];

  // Base rarities (DB)
  for (const r of base) {
    // si tu veux exclure des valeurs bizarres, filtre ici
    const label = BASE_LABELS[r] ?? r;
    options.push({ value: r, label });
  }

  // UI rarities (dérivées)
  if (hasAlternative) options.push({ value: "ALTERNATIVE", label: "Alternative" });

  // Manga = p2 mangas OU Red Manga OP-13 (p3) (sinon t’auras un set avec red manga mais aucun choix manga)
  if (hasMangaP2 || hasRedManga) options.push({ value: "MANGA", label: "Manga" });

  if (hasFiveElders) options.push({ value: "FIVE_ELDERS", label: "Cinq Doyens" });

  options.sort((a, b) => sortOrder(a.value) - sortOrder(b.value));

  return NextResponse.json({ success: true, rarities: options });
}