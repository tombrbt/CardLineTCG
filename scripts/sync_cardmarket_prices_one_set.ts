import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_LIST_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

const SET_CODE = (process.env.SET_CODE || "").trim(); // ex: EB-02

if (!SET_CODE) {
  console.error("❌ SET_CODE manquant. Ex: SET_CODE=EB-02");
  process.exit(1);
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

function extractCodeFromName(name: string): string | null {
  // OP / ST / EB / PRB
  const m = name.match(/\(((?:OP|ST|EB|PRB)\d{2}-\d{3})\)/i);
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

function hasAll(set: Set<string>, items: string[]) {
  return items.every((x) => set.has(x));
}

function getVariantOrderForSet(setCode: string, variantsPresent: Set<string>): string[] {
  // ✅ OP-13 : si p2+p3+p4 existent, ordre spécial
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

// ✅ exemple OP13-118 (si jamais tu testes OP-13)
function variantIndexOP13118(variant: string): number {
  if (!variant || variant === "base") return 0; // V.1
  if (variant === "p1") return 1;              // V.2
  if (variant === "p4") return 2;              // V.3
  if (variant === "p2") return 3;              // V.4
  if (variant === "p3") return 4;              // V.5
  return 0;
}

async function main() {
  // 1) Lire l’expansion id depuis la DB (recommandé)
  const setRow = await prisma.set.findUnique({
    where: { code: SET_CODE },
    select: { code: true, cardmarketExpansionId: true },
  });

  if (!setRow) {
    console.error(`❌ Set introuvable en DB: ${SET_CODE}`);
    process.exit(1);
  }

  const EXPANSION_ID = Number(setRow.cardmarketExpansionId);

  if (!Number.isFinite(EXPANSION_ID) || EXPANSION_ID <= 0) {
    console.error(
      `❌ cardmarketExpansionId manquant/invalid pour ${SET_CODE}. Ajoute-le en DB (Set.cardmarketExpansionId).`
    );
    process.exit(1);
  }

  console.log(`🎯 Test sync UNIQUEMENT: ${SET_CODE} (idExpansion=${EXPANSION_ID})`);

  console.log("⬇️ Téléchargement Product List…");
  const productRaw = await fetch(PRODUCT_LIST_URL).then((r) => r.json());
  const products = asArray(productRaw);
  console.log(`✅ Product list: ${products.length} lignes`);

  console.log("⬇️ Téléchargement Price Guide…");
  const priceGuideRaw = await fetch(PRICE_GUIDE_URL).then((r) => r.json());
  const priceRows = Array.isArray(priceGuideRaw?.priceGuides)
    ? priceGuideRaw.priceGuides
    : asArray(priceGuideRaw);
  console.log(`✅ Price guide: ${priceRows.length} lignes`);

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

  const cards = await prisma.card.findMany({
    where: { set: { code: SET_CODE } },
    select: { id: true, code: true, variant: true },
  });
  console.log(`🧾 Cartes BDD (${SET_CODE}): ${cards.length}`);

  // group by code
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

    // ✅ Cas spécial OP13-118 si jamais
    if (SET_CODE === "OP-13" && code === "OP13-118") {
      for (const c of group) {
        const idx = variantIndexOP13118(c.variant);
        const best = candidates[idx];
        if (!best) { skipped++; continue; }

        const pg = priceByProductId.get(Number(best.idProduct));
        if (!pg) { skipped++; continue; }

        await prisma.cardPrice.upsert({
          where: { cardId: c.id },
          update: {
            lowPrice: getNumber(pg.low),
            trendPrice: getNumber(pg.trend),
            avg7: getNumber(pg.avg7),
            avg30: getNumber(pg.avg30),
          },
          create: {
            cardId: c.id,
            lowPrice: getNumber(pg.low),
            trendPrice: getNumber(pg.trend),
            avg7: getNumber(pg.avg7),
            avg30: getNumber(pg.avg30),
          },
        });

        updated++;
      }
      continue;
    }

    const variantsPresent = new Set(group.map((x) => x.variant || "base"));
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

      const pg = priceByProductId.get(Number(best.idProduct));
      if (!pg) {
        skipped++;
        continue;
      }

      await prisma.cardPrice.upsert({
        where: { cardId: c.id },
        update: {
          lowPrice: getNumber(pg.low),
          trendPrice: getNumber(pg.trend),
          avg7: getNumber(pg.avg7),
          avg30: getNumber(pg.avg30),
        },
        create: {
          cardId: c.id,
          lowPrice: getNumber(pg.low),
          trendPrice: getNumber(pg.trend),
          avg7: getNumber(pg.avg7),
          avg30: getNumber(pg.avg30),
        },
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