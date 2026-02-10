// scripts/sync_cardmarket_prices_by_set.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_LIST_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

/**
 * Usage:
 *   SET_CODE=OP-10 EXPANSION_ID=5974 npx tsx scripts/sync_cardmarket_prices_by_set.ts
 *   SET_CODE=OP-09 EXPANSION_ID=5755 npx tsx scripts/sync_cardmarket_prices_by_set.ts
 */
const SET_CODE = (process.env.SET_CODE || "").trim();          // ex: OP-10
const EXPANSION_ID = Number(process.env.EXPANSION_ID || "0");  // ex: 5974

if (!SET_CODE) {
  console.error("❌ SET_CODE manquant. Ex: SET_CODE=OP-10");
  process.exit(1);
}
if (!Number.isFinite(EXPANSION_ID) || EXPANSION_ID <= 0) {
  console.error("❌ EXPANSION_ID invalide. Ex: EXPANSION_ID=5974");
  process.exit(1);
}

function extractCodeFromName(name: string): string | null {
    const m = name.match(/\(((?:OP|ST|EB)\d{2}-\d{3})\)/i);
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

/**
 * Mapping variant -> index V.x, basé sur la liste triée par idProduct pour UN code donné.
 * Règle:
 * - base => V.1
 * - p1   => V.2
 * - si 4+ produits: p3 => V.3, p2 => V.4
 * - si 3 produits : p2 => V.3 (pas de p3)
 */
function variantIndex(variant: string, candidateCount: number): number {
  if (!variant || variant === "base") return 0; // V.1
  if (variant === "p1") return 1;              // V.2

  if (candidateCount >= 4) {
    if (variant === "p3") return 2;            // V.3
    if (variant === "p2") return 3;            // V.4
    return 0;
  }

  // candidateCount == 3 => V.3 = p2
  if (variant === "p2") return 2;
  return 0;
}

async function main() {
  console.log(`🎯 Sync Cardmarket UNIQUEMENT pour: ${SET_CODE} (idExpansion=${EXPANSION_ID})`);

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

  // idProduct -> row price
  const priceByProductId = new Map<number, any>();
  for (const row of priceRows) {
    const idProduct = Number(row.idProduct);
    if (Number.isFinite(idProduct)) priceByProductId.set(idProduct, row);
  }

  // code -> products (filtrés expansion)
  const productsByCode = new Map<string, any[]>();
  for (const p of products) {
    if (Number(p.idExpansion) !== EXPANSION_ID) continue; // ✅ filtre expansion ici
    const code = extractCodeFromName(String(p.name ?? ""));
    if (!code) continue;
    const arr = productsByCode.get(code) ?? [];
    arr.push(p);
    productsByCode.set(code, arr);
  }
  console.log(`🧩 Codes trouvés pour idExpansion=${EXPANSION_ID}: ${productsByCode.size}`);

  // ✅ IMPORTANT: on ne prend QUE les cartes de l’extension demandée
  const cards = await prisma.card.findMany({
    where: { set: { code: SET_CODE } },
    select: { id: true, code: true, variant: true },
  });
  console.log(`🧾 Cartes BDD (${SET_CODE}): ${cards.length}`);

  let updated = 0;
  let skipped = 0;

  for (const c of cards) {
    const code = String(c.code).toUpperCase();
    const candidates = (productsByCode.get(code) ?? []).slice();

    if (!candidates.length) {
      skipped++;
      continue;
    }

    candidates.sort((a, b) => Number(a.idProduct) - Number(b.idProduct));

    const idx = variantIndex(String(c.variant ?? "base"), candidates.length);
    const best = candidates[idx] ?? candidates[0];

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
  }

  console.log(`✅ Prix upsert (${SET_CODE}): ${updated}`);
  console.log(`⚠️ Skipped (${SET_CODE}): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());