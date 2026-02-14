import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_LIST_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

/**
 * Usage:
 *   SET_CODE=OP-13 EXPANSION_ID=???? npx tsx scripts/sync_cardmarket_prices_by_set.ts
 *   SET_CODE=OP-12 EXPANSION_ID=6186 npx tsx scripts/sync_cardmarket_prices_by_set.ts
 */
const SET_CODE = (process.env.SET_CODE || "").trim();
const EXPANSION_ID = Number(process.env.EXPANSION_ID || "0");

if (!SET_CODE) {
  console.error("❌ SET_CODE manquant. Ex: SET_CODE=OP-12");
  process.exit(1);
}
if (!Number.isFinite(EXPANSION_ID) || EXPANSION_ID <= 0) {
  console.error("❌ EXPANSION_ID invalide. Ex: EXPANSION_ID=6186");
  process.exit(1);
}

function hasAll(set: Set<string>, items: string[]) {
  return items.every((x) => set.has(x));
}

function getVariantOrderForSet(setCode: string, variantsPresent: Set<string>): string[] {
  // ✅ OP-13 : règle globale si p2+p3+p4 existent
  if (setCode === "OP-13" && hasAll(variantsPresent, ["p2", "p3", "p4"])) {
    return ["base", "p1", "p4", "p2", "p3"];
  }
  return ["base", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
}

function variantRankForSet(setCode: string, variantsPresent: Set<string>, variant: string): number {
  const order = getVariantOrderForSet(setCode, variantsPresent);
  const v = variant && variant.length ? variant : "base";
  const idx = order.indexOf(v);
  return idx === -1 ? 999 : idx;
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

function isJunkVariantName(name: string) {
  return /(misprint|errata|error|test\s*print|sample|proxy)/i.test(name);
}

/**
 * ✅ OP13-118 : on mappe PAR TYPE (pas par index), car Cardmarket a des produits “en plus”
 * Règles demandées:
 * - base/p1 : inchangé => ce sont les 2 restants (plus petits idProduct)
 * - p2 => V.4 (Manga)
 * - p3 => V.5 (Red Manga)
 * - p4 => V.3 (SP)
 */
function pickProductForOP13118(
  variant: string,
  candidatesSorted: any[]
): any | null {
  const norm = (s: any) => String(s ?? "").toLowerCase();

  // retire junk (misprint etc.)
  const clean = candidatesSorted.filter((p) => !isJunkVariantName(String(p.name ?? "")));

  // buckets
  const redManga = clean.filter((p) => /red\s*manga/i.test(String(p.name ?? "")));
  const manga = clean.filter(
    (p) =>
      /manga/i.test(String(p.name ?? "")) &&
      !/red\s*manga/i.test(String(p.name ?? ""))
  );
  const special = clean.filter((p) => /\bsp\b|special/i.test(norm(p.name)));

  // leftovers = ceux qui ne sont ni manga/redmanga/sp
  const used = new Set<number>([
    ...redManga.map((p) => Number(p.idProduct)),
    ...manga.map((p) => Number(p.idProduct)),
    ...special.map((p) => Number(p.idProduct)),
  ]);
  const leftovers = clean
    .filter((p) => !used.has(Number(p.idProduct)))
    .slice()
    .sort((a, b) => Number(a.idProduct) - Number(b.idProduct));

  // assignations
  if (!variant || variant === "base") {
    return leftovers[0] ?? clean[0] ?? null;
  }
  if (variant === "p1") {
    return leftovers[1] ?? leftovers[0] ?? clean[0] ?? null;
  }
  if (variant === "p4") {
    // SP
    return special[0] ?? null;
  }
  if (variant === "p2") {
    // Manga (V.4)
    return manga[0] ?? null;
  }
  if (variant === "p3") {
    // Red Manga (V.5)
    return redManga[0] ?? null;
  }

  return null;
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

  // idProduct -> price row
  const priceByProductId = new Map<number, any>();
  for (const row of priceRows) {
    const idProduct = Number(row.idProduct);
    if (Number.isFinite(idProduct)) priceByProductId.set(idProduct, row);
  }

  // code -> products (filtrés expansion)
  const productsByCode = new Map<string, any[]>();
  for (const p of products) {
    if (Number(p.idExpansion) !== EXPANSION_ID) continue;
    const code = extractCodeFromName(String(p.name ?? ""));
    if (!code) continue;
    const arr = productsByCode.get(code) ?? [];
    arr.push(p);
    productsByCode.set(code, arr);
  }
  console.log(`🧩 Codes trouvés pour idExpansion=${EXPANSION_ID}: ${productsByCode.size}`);

  // ✅ uniquement les cartes de l’extension demandée
  const cards = await prisma.card.findMany({
    where: { set: { code: SET_CODE } },
    select: { id: true, code: true, variant: true },
  });
  console.log(`🧾 Cartes BDD (${SET_CODE}): ${cards.length}`);

  // regrouper par code
  const cardsByCode = new Map<string, Array<{ id: number; code: string; variant: string }>>();
  for (const c of cards) {
    const code = String(c.code).toUpperCase();
    const arr = cardsByCode.get(code) ?? [];
    arr.push({ id: c.id, code, variant: String(c.variant ?? "base") });
    cardsByCode.set(code, arr);
  }

  let updated = 0;
  let skipped = 0;

  for (const [code, group] of cardsByCode.entries()) {
    const candidates = (productsByCode.get(code) ?? []).slice();

    if (!candidates.length) {
      skipped += group.length;
      continue;
    }

    candidates.sort((a, b) => Number(a.idProduct) - Number(b.idProduct));

    // ✅ SPÉCIAL OP13-118 : mapping fixe sur 5 produits (V.1..V.5) car Cardmarket n'a pas de labels dans le name
    if (SET_CODE === "OP-13" && code === "OP13-118") {
      console.log("---- DEBUG OP13-118 candidates ----");
      console.log(candidates.map((p) => `${p.idProduct} | ${String(p.name ?? "")}`));

      // On veut exactement 5 produits (V.1..V.5)
      if (candidates.length < 5) {
        console.log(`⚠️ OP13-118: expected 5 candidates, got ${candidates.length}`);
      }

      // mapping demandé : base=V1, p1=V2, p4=V3, p2=V4, p3=V5
      const pickIndex = (variant: string) => {
        if (!variant || variant === "base") return 0; // base
        if (variant === "p1") return 1;              // alt

        // ✅ OP13-118 (spécial Cardmarket) :
        // p2 = Manga, p3 = Red Manga, p4 = SP
        if (variant === "p2") return 2;
        if (variant === "p3") return 3;
        if (variant === "p4") return 4;

        return 0;
      };

      for (const c of group) {
        const idx = pickIndex(String(c.variant ?? "base"));
        const best = candidates[idx];

        if (!best) {
          skipped++;
          console.log(`⚠️ OP13-118: no candidate at idx=${idx} for variant=${c.variant}`);
          continue;
        }

        const idProduct = Number(best.idProduct);
        const pg = priceByProductId.get(idProduct);
        if (!pg) {
          skipped++;
          console.log(`⚠️ OP13-118: price missing for idProduct=${idProduct}`);
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
        console.log(
          `✅ OP13-118 ${c.variant} -> idx=${idx} picked ${idProduct} | low=${lowPrice}`
        );
      }

      continue;
    }

    // ===== CAS SPÉCIAL OP13-119 (ACE) =====
    if (SET_CODE === "OP-13" && code === "OP13-119") {

      console.log("---- DEBUG OP13-119 candidates ----");
      console.log(candidates.map(c => `${c.idProduct} | ${c.name}`));

      const pickIndex = (variant: string) => {
        if (!variant || variant === "base") return 0;
        if (variant === "p1") return 1;

        // Mapping spécifique Ace
        // Cardmarket a une V6 supplémentaire
        if (variant === "p2") return 4; // V5
        if (variant === "p3") return 5; // V6
        if (variant === "p4") return 2; // SP

        return 0;
      };

      for (const c of group) {
        const idx = pickIndex(c.variant);

        const best = candidates[idx];
        if (!best) {
          console.log(`⚠️ OP13-119: no match for variant=${c.variant}`);
          skipped++;
          continue;
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

        console.log(`✅ OP13-119 ${c.variant} -> idx=${idx} picked ${best.idProduct} | low=${lowPrice}`);

        await prisma.cardPrice.upsert({
          where: { cardId: c.id },
          update: { lowPrice, trendPrice, avg7, avg30 },
          create: { cardId: c.id, lowPrice, trendPrice, avg7, avg30 },
        });

        updated++;
      }

      continue;
    }

    // --- LOGIQUE STANDARD ---
    const variantsPresent = new Set(group.map((x) => String(x.variant ?? "base")));
    const sortedCards = group
      .slice()
      .sort(
        (a, b) =>
          variantRankForSet(SET_CODE, variantsPresent, a.variant) -
          variantRankForSet(SET_CODE, variantsPresent, b.variant)
      );

    const minLen = Math.min(sortedCards.length, candidates.length);

    for (let i = 0; i < minLen; i++) {
      const c = sortedCards[i];
      const best = candidates[i];

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

    if (sortedCards.length > candidates.length) {
      skipped += sortedCards.length - candidates.length;
    }
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