import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_LIST_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

// ✅ OP-09 : on FORCE l’expansion EU
const OP09_EXPANSION_EU = 5755;

function extractCodeFromName(name: string): string | null {
  const m = name.match(/\((OP\d{2}-\d{3})\)/i);
  return m ? m[1].toUpperCase() : null;
}

function getNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.products)) return raw.products;
  if (Array.isArray(raw.priceGuides)) return raw.priceGuides;
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

// OP-09 : index dans la liste triée par idProduct (V.1, V.2, V.3, V.4)
function indexForOP09Variant(variant: string, count: number): number {
  if (variant === "base") return 0; // V.1
  if (variant === "p1") return 1;   // V.2

  if (count >= 4) {
    if (variant === "p3") return 2; // V.3
    if (variant === "p2") return 3; // V.4
    return 0;
  }

  // count == 3 : pas de V.4 => V.3 = p2
  if (variant === "p2") return 2;
  return 0;
}

async function main() {
  console.log("⬇️ Téléchargement Product List…");
  const productRaw = await fetch(PRODUCT_LIST_URL).then((r) => r.json());
  const products = asArray(productRaw);
  if (!products.length) throw new Error("Product list vide ou format inattendu.");
  console.log(`✅ Product list: ${products.length} lignes`);

  console.log("⬇️ Téléchargement Price Guide…");
  const priceGuideRaw = await fetch(PRICE_GUIDE_URL).then((r) => r.json());
  const priceRows = Array.isArray(priceGuideRaw?.priceGuides)
    ? priceGuideRaw.priceGuides
    : asArray(priceGuideRaw);

  if (!priceRows.length) throw new Error("Price guide vide ou format inattendu.");
  console.log(`✅ Price guide: ${priceRows.length} lignes`);

  const priceByProductId = new Map<number, any>();
  for (const row of priceRows) {
    const idProduct = Number(row.idProduct);
    if (Number.isFinite(idProduct)) priceByProductId.set(idProduct, row);
  }

  // code -> produits (TOUS)
  const productsByCode = new Map<string, any[]>();
  for (const p of products) {
    const code = extractCodeFromName(String(p.name ?? ""));
    if (!code) continue;
    const arr = productsByCode.get(code) ?? [];
    arr.push(p);
    productsByCode.set(code, arr);
  }

  // cartes DB
  const cards = await prisma.card.findMany({
    select: { id: true, code: true, variant: true, set: { select: { code: true } } },
  });
  console.log(`🧾 Cartes BDD: ${cards.length}`);

  let updated = 0;
  let skipped = 0;

  for (const c of cards) {
    const code = c.code.toUpperCase();
    const allCandidates = productsByCode.get(code) ?? [];
    if (!allCandidates.length) {
      skipped++;
      continue;
    }

    let candidates = allCandidates;

    // ✅ OP-09 : on ne garde QUE l’expansion EU 5755
    if (c.set.code === "OP-09") {
      candidates = candidates.filter((p) => Number(p.idExpansion) === OP09_EXPANSION_EU);
    }

    if (!candidates.length) {
      skipped++;
      continue;
    }

    // Tri stable V.1 -> V.2 -> ...
    candidates.sort((a, b) => Number(a.idProduct) - Number(b.idProduct));

    let best = candidates[0];

    if (c.set.code === "OP-09") {
      const idx = indexForOP09Variant(String(c.variant ?? "base"), candidates.length);
      best = candidates[idx] ?? candidates[0];
    }

    const idProduct = Number(best.idProduct);
    const pg = priceByProductId.get(idProduct);
    if (!pg) {
      skipped++;
      continue;
    }

    const lowPrice = getNumber(pg.low);
    const trendPrice = getNumber(pg.trend);
    const avg7 = getNumber(pg.avg7);
    const avg30 = getNumber(pg.avg30);

    await prisma.cardPrice.upsert({
      where: { cardId: c.id },
      update: { lowPrice, trendPrice, avg7, avg30 },
      create: { cardId: c.id, lowPrice, trendPrice, avg7, avg30 },
    });

    updated++;

    // Debug ciblé
    if (code === "OP09-118") {
      console.log("---- DEBUG OP09-118 ----");
      console.log("Candidates EU 5755:", candidates.map((p) => p.idProduct));
      console.log("Picked:", idProduct, "variant:", c.variant);
      console.log("prices:", { lowPrice, trendPrice, avg7, avg30 });
    }
  }

  console.log(`✅ Prix upsert: ${updated}`);
  console.log(`⚠️ Skipped (pas de match / pas de price): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());