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

// ---- Rarity filters (DB + UI) ----
const ELDERS_CODES = ["OP13-080", "OP13-083", "OP13-084", "OP13-089", "OP13-091"];
const RED_MANGA_CODES = ["OP13-118", "OP13-119", "OP13-120"];

if (rarity) {
  if (rarity === "MANGA") {
    // Manga = p2 (hors TR/SP + hors Cinq Doyens) OU Red Manga (OP13 p3 sur codes précis)
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          {
            variant: "p2",
            rarity: { notIn: ["TR", "SP CARD"] },
            code: { notIn: ELDERS_CODES },
          },
          {
            variant: "p3",
            code: { in: RED_MANGA_CODES },
          },
        ],
      },
    ];
  } else if (rarity === "ALTERNATIVE") {
    where.variant = "p1";
    where.rarity = { notIn: ["TR", "SP CARD"] };
  } else if (rarity === "FIVE_ELDERS") {
    // Cinq Doyens = uniquement ces codes + p2
    where.code = { in: ELDERS_CODES };
    where.variant = "p2";
  } else {
    // Raretés normales (DB)
    where.rarity = rarity;
  }
}
    // Cas spécial : Alternative (si tu l'utilises)
      if (rarity === "ALTERNATIVE") {
        where.variant = "p1";
        where.rarity = { notIn: ["TR", "SP CARD"] };
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

  const isPriceSort = sort === "price_low_asc" || sort === "price_low_desc";

if (isPriceSort) {
  const direction = sort === "price_low_desc" ? "DESC" : "ASC";

  // 1) total (mêmes filtres)
  const total = await prisma.card.count({ where });

  // 2) ids triés par prix (LEFT JOIN + COALESCE => null à la fin)
  // IMPORTANT: on applique les mêmes filtres "where" via Prisma, donc on passe par une première sélection d'IDs filtrés
  // (sinon tu réécris toute la clause WHERE en SQL)
  const filteredIds = await prisma.card.findMany({
    where,
    select: { id: true },
  });
  const ids = filteredIds.map((x) => x.id);

  if (ids.length === 0) {
    return NextResponse.json({
      success: true,
      page,
      pageSize,
      total: 0,
      totalPages: 0,
      cards: [],
    });
  }

// Coalesce très grand pour pousser les nulls en bas (ASC) ou en bas (DESC aussi) :
  // - ASC : COALESCE(lowPrice, 1e9)
  // - DESC : COALESCE(lowPrice, -1) => mais on veut nulls en bas, donc plutôt  -1 poserait nulls en haut.
  // => on garde COALESCE(lowPrice, -1) et on trie aussi sur "lowPrice IS NULL" en premier.
  //
  // Solution simple et robuste : ORDER BY (cp.lowPrice IS NULL) ASC, cp.lowPrice {direction}
  const rows = await prisma.$queryRaw<
    Array<{ id: number }>
  >`
    SELECT c.id
    FROM "Card" c
    LEFT JOIN "CardPrice" cp ON cp."cardId" = c.id
    WHERE c.id = ANY(${ids})
    ORDER BY (cp."lowPrice" IS NULL) ASC, cp."lowPrice" ${prisma.$queryRawUnsafe(direction)}
    OFFSET ${skip}
    LIMIT ${pageSize}
  `;

  const pageIds = rows.map((r) => r.id);

  // 3) Récupérer les cartes + price (et les remettre dans le bon ordre)
  const cardsUnordered = await prisma.card.findMany({
    where: { id: { in: pageIds } },
    select: {
      id: true,
      code: true,
      variant: true,
      name: true,
      type: true,
      color: true,
      rarity: true,
      illustrationUrl: true,
      feature: true,
      set: { select: { code: true, name_fr: true } },
      price: { select: { lowPrice: true, trendPrice: true, avg7: true, avg30: true, updatedAt: true } },
    },
  });


  const byId = new Map(cardsUnordered.map((c) => [c.id, c]));
  const cards = pageIds.map((id) => byId.get(id)).filter(Boolean);

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    cards,
  });
}



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