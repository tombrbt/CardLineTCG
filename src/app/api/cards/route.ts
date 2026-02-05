import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Filters
  const set = url.searchParams.get("set")?.trim() || undefined; // ex: "OP-09"
  const search = url.searchParams.get("search")?.trim() || undefined;
  const color = url.searchParams.get("color")?.trim() || undefined;
  const type = url.searchParams.get("type")?.trim() || undefined;
  const rarity = url.searchParams.get("rarity")?.trim() || undefined;
  const family = url.searchParams.get("family")?.trim() || undefined;

  // Sorting
  const sort = url.searchParams.get("sort")?.trim() || "code_asc";

  // Pagination
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "24", 10), 1), 100);
  const skip = (page - 1) * pageSize;

  // WHERE
  const where: any = {};
  if (set) where.set = { code: set };
  if (color) where.color = color;
  if (type) where.type = type;
  if (rarity) {
    // Cas spécial OP-09 : Manga
    if (rarity === "MANGA") {
      where.variant = "p2";
    } else {
      // Raretés normales
      where.rarity = rarity;
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { text: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      // optionnel : chercher aussi dans le nom de set
      { set: { name_fr: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (family) {
    // feature peut contenir "Quatre Empereurs/Équipage du Roux"
    // => family="Équipage du Roux" match en contains
    where.feature = { contains: family, mode: "insensitive" };
  }

  // ORDER BY
  // Note: on garde variant en second tri pour afficher base puis p1 ensemble
  let orderBy: any;

  if (sort === "code_desc") orderBy = [{ code: "desc" }, { variant: "asc" }];
  else if (sort === "name_asc") orderBy = [{ name: "asc" }, { code: "asc" }, { variant: "asc" }];
  else if (sort === "name_desc") orderBy = [{ name: "desc" }, { code: "asc" }, { variant: "asc" }];
  else orderBy = [{ code: "asc" }, { variant: "asc" }]; // code_asc par défaut

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      select: {
        id: true,
        code: true,
        variant: true,
        name: true,
        type: true,
        color: true,
        rarity: true,
        illustrationUrl: true,
        setId: true, // si besoin
      },
    }),
  ]);
  
//   const hasNextPage = cards.length > pageSize;
// cards.pop();

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    cards,
  });
}