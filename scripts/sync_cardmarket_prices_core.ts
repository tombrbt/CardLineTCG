// /scripts/sync_cardmarket_prices_core.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_LIST_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";

export type SyncOptions = {
  setCode?: string; // optionnel : forcer 1 set
  dryRun?: boolean; // true => n'écrit rien en DB
  verbose?: boolean; // logs plus bavards
};

function asArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.products)) return raw.products;
  if (Array.isArray(raw.priceGuides)) return raw.priceGuides;
  if (typeof raw === "object") return Object.values(raw);
  return [];
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

/**
 * ✅ Extraction code carte depuis le name Cardmarket.
 * On prend le DERNIER "(XXXX00-000)" trouvé dans le name (souvent le plus fiable).
 * Supporte OP / ST / EB / PRB… et en vrai tout prefix alphanum 1..6 + 0..2 digits puis -000.
 */
function extractCodeFromName(name: string): string | null {
  const matches = String(name ?? "").match(/\(([A-Z]{1,6}\d{0,2}-\d{3})\)/gi);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.replace(/[()]/g, "").toUpperCase();
}

// Nettoyage variantes “intrus” Cardmarket (misprint, errata, etc.)
function isJunkVariantName(name: string) {
  return /(misprint|errata|error|test\s*print|sample|proxy)/i.test(String(name ?? ""));
}

/**
 * ✅ OP13-118 : mapping EXACT (V.1..V.5) => base,p1,p4,p2,p3
 * (ça marche chez toi)
 */
function variantIndexOP13118(variant: string): number {
    if (!variant || variant === "base") return 0;
    if (variant === "p1") return 1;
  
    // ✅ OP13-118 (spécial Cardmarket)
    if (variant === "p2") return 2;
    if (variant === "p3") return 3;
    if (variant === "p4") return 4;
  
    return 0;
  }

/**
 * ✅ OP13-119 (Ace) : mapping que tu as validé (tu avais p2=V5, p3=V6, p4=V3)
 * Ici on suit ton dernier mapping “qui marche”.
 * Si Cardmarket te donne 6 candidats :
 *   idx: 0=V1(base), 1=V2(p1), 2=V3(p4), 3=V4(?), 4=V5(p2), 5=V6(p3)
 */
function variantIndexOP13119(variant: string): number {
  if (!variant || variant === "base") return 0;
  if (variant === "p1") return 1;
  if (variant === "p4") return 2; // V.3
  if (variant === "p2") return 4; // V.5
  if (variant === "p3") return 5; // V.6
  return 0;
}

function resolveSpecialIndex(setCode: string, cardCode: string, variant: string): number | null {
  if (setCode === "OP-13" && cardCode === "OP13-118") return variantIndexOP13118(variant);
  if (setCode === "OP-13" && cardCode === "OP13-119") return variantIndexOP13119(variant);
  return null;
}

/**
 * ✅ Ordre des variantes DB (sert à trier les cartes du même code pour le mapping séquentiel).
 * Ici on met l’ordre que TU utilises côté UI pour OP-13 quand p2+p3+p4 existent.
 * Sinon ordre naturel.
 */
function hasAll(set: Set<string>, items: string[]) {
  return items.every((x) => set.has(x));
}

function getVariantOrderForSet(setCode: string, variantsPresent: Set<string>): string[] {
    // ✅ OP-13 : règle globale si p2+p3+p4 existent
    if (setCode === "OP-13" && hasAll(variantsPresent, ["p2", "p3", "p4"])) {
      return ["base", "p1", "p4", "p2", "p3"];
    }
  
    // ✅ RÈGLE GÉNÉRALE (Cardmarket) :
    // Quand p2 ET p3 existent (format 4 variantes), Cardmarket a souvent l’ordre :
    // base, p1, p3, p2
    if (variantsPresent.has("p2") && variantsPresent.has("p3")) {
      return ["base", "p1", "p3", "p2", "p4", "p5", "p6", "p7", "p8"];
    }
  
    // défaut
    return ["base", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  }

function variantRankForSet(setCode: string, variantsPresent: Set<string>, variant: string): number {
  const order = getVariantOrderForSet(setCode, variantsPresent);
  const v = variant && variant.length ? variant : "base";
  const idx = order.indexOf(v);
  return idx === -1 ? 999 : idx;
}

let _catalogCache:
  | null
  | {
      products: any[];
      priceByProductId: Map<number, any>;
    } = null;

async function fetchCatalogCached() {
  if (_catalogCache) return _catalogCache;

  const [productRaw, priceGuideRaw] = await Promise.all([
    fetch(PRODUCT_LIST_URL).then((r) => r.json()),
    fetch(PRICE_GUIDE_URL).then((r) => r.json()),
  ]);

  const products = asArray(productRaw);
  const priceRows = Array.isArray(priceGuideRaw?.priceGuides)
    ? priceGuideRaw.priceGuides
    : asArray(priceGuideRaw);

  if (!products.length) throw new Error("Product list vide ou format inattendu.");
  if (!priceRows.length) throw new Error("Price guide vide ou format inattendu.");

  const priceByProductId = new Map<number, any>();
  for (const row of priceRows) {
    const idProduct = Number(row.idProduct);
    if (Number.isFinite(idProduct)) priceByProductId.set(idProduct, row);
  }

  _catalogCache = { products, priceByProductId };
  return _catalogCache;
}

export async function syncOneSetPrices(
  setCode: string,
  expansionId: number,
  opts: SyncOptions = {}
) {
  const dryRun = !!opts.dryRun;
  const verbose = !!opts.verbose;

  const skippedDetails: Array<{ code: string; variant: string; reason: string }> = [];

  console.log(`\n🎯 Sync SET=${setCode} (idExpansion=${expansionId}) dryRun=${dryRun}`);

  const { products, priceByProductId } = await fetchCatalogCached();
  console.log(`✅ Product list: ${products.length} lignes`);
  console.log(`✅ Price guide: ${priceByProductId.size} lignes`);

  // code -> products (filtrés expansion)
  const productsByCode = new Map<string, any[]>();
  for (const p of products) {
    if (Number(p.idExpansion) !== expansionId) continue;
    const code = extractCodeFromName(String(p.name ?? ""));
    if (!code) continue;
    const arr = productsByCode.get(code) ?? [];
    arr.push(p);
    productsByCode.set(code, arr);
  }
  console.log(`🧩 Codes trouvés pour idExpansion=${expansionId}: ${productsByCode.size}`);

  // cartes DB du set
  const cards = await prisma.card.findMany({
    where: { set: { code: setCode } },
    select: { id: true, code: true, variant: true },
  });
  console.log(`🧾 Cartes BDD (${setCode}): ${cards.length}`);

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

  for (const [cardCode, group] of cardsByCode.entries()) {
    let candidates = (productsByCode.get(cardCode) ?? []).slice();

    if (!candidates.length) {
      skipped += group.length;
      for (const c of group) {
        skippedDetails.push({
          code: cardCode,
          variant: c.variant,
          reason: "no_product_candidates_for_expansion",
        });
      }
      continue;
    }

    // tri stable Cardmarket
    candidates.sort((a, b) => Number(a.idProduct) - Number(b.idProduct));

    // ✅ Nettoyage intrus pour OP13-118/119
    if (setCode === "OP-13" && (cardCode === "OP13-118" || cardCode === "OP13-119")) {
      candidates = candidates.filter((p) => !isJunkVariantName(String(p.name ?? "")));
      candidates.sort((a, b) => Number(a.idProduct) - Number(b.idProduct));
    }

    if (verbose && (cardCode === "OP13-118" || cardCode === "OP13-119")) {
      console.log(`---- DEBUG ${cardCode} candidates ----`);
      console.log(candidates.map((p) => `${p.idProduct} | ${p.name}`));
    }

    // ✅ CAS SPÉCIAUX OP-13 (mapping par index fixe)
    if (setCode === "OP-13" && (cardCode === "OP13-118" || cardCode === "OP13-119")) {
      for (const c of group) {
        const idx = resolveSpecialIndex(setCode, cardCode, c.variant);
        const best = idx == null ? null : candidates[idx];

        if (!best) {
          skipped++;
          skippedDetails.push({
            code: cardCode,
            variant: c.variant,
            reason: `no_best_candidate_idx=${idx}_candidates=${candidates.length}`,
          });
          if (verbose) {
            console.log(`⚠️ ${cardCode}: no match for variant=${c.variant} idx=${idx} candidates=${candidates.length}`);
          }
          continue;
        }

        const idProduct = Number(best.idProduct);
        const pg = priceByProductId.get(idProduct);
        if (!pg) {
          skipped++;
          skippedDetails.push({
            code: cardCode,
            variant: c.variant,
            reason: `missing_priceGuide_idProduct=${idProduct}`,
          });
          continue;
        }

        const lowPrice = getNumber(pg.low);
        const trendPrice = getNumber(pg.trend);
        const avg7 = getNumber(pg.avg7);
        const avg30 = getNumber(pg.avg30);

        if (verbose) {
          console.log(`✅ ${cardCode} ${c.variant} -> idx=${idx} picked ${idProduct} | low=${lowPrice}`);
        }

        if (!dryRun) {
          await prisma.cardPrice.upsert({
            where: { cardId: c.id },
            update: { lowPrice, trendPrice, avg7, avg30 },
            create: { cardId: c.id, lowPrice, trendPrice, avg7, avg30 },
          });
        }

        updated++;
      }

      continue; // ne pas passer au mapping standard
    }

    // ✅ LOGIQUE STANDARD CORRIGÉE : mapping SÉQUENTIEL (plus de idx=p5 => 5 etc.)
    // 1) trier les cartes DB selon l’ordre du set
    const variantsPresent = new Set(group.map((x) => String(x.variant ?? "base")));
    const sortedCards = group
      .slice()
      .sort(
        (a, b) =>
          variantRankForSet(setCode, variantsPresent, a.variant) -
          variantRankForSet(setCode, variantsPresent, b.variant)
      );

    // 2) mapper i -> i, et si candidates < cards => clamp sur le dernier candidat (évite skipped)
    for (let i = 0; i < sortedCards.length; i++) {
      const c = sortedCards[i];
      const best = candidates[Math.min(i, candidates.length - 1)];

      if (!best) {
        skipped++;
        skippedDetails.push({
          code: cardCode,
          variant: c.variant,
          reason: `no_candidate_at_i=${i}_candidates=${candidates.length}`,
        });
        continue;
      }

      const idProduct = Number(best.idProduct);
      const pg = priceByProductId.get(idProduct);

      if (!pg) {
        skipped++;
        skippedDetails.push({
          code: cardCode,
          variant: c.variant,
          reason: `missing_priceGuide_idProduct=${idProduct}`,
        });
        continue;
      }

      const lowPrice = getNumber(pg.low);
      const trendPrice = getNumber(pg.trend);
      const avg7 = getNumber(pg.avg7);
      const avg30 = getNumber(pg.avg30);

      if (!dryRun) {
        await prisma.cardPrice.upsert({
          where: { cardId: c.id },
          update: { lowPrice, trendPrice, avg7, avg30 },
          create: { cardId: c.id, lowPrice, trendPrice, avg7, avg30 },
        });
      }

      updated++;
    }
  }

  console.log(`✅ Prix upsert (${setCode}): ${updated}`);
  console.log(`⚠️ Skipped (${setCode}): ${skipped}`);

  if (skippedDetails.length) {
    console.log("---- SKIPPED DETAILS (first 50) ----");
    console.log(skippedDetails.slice(0, 50));
  }

  return { setCode, updated, skipped };
}

export async function syncAllSetsPrices(opts: SyncOptions = {}) {
  const dryRun = !!opts.dryRun;

  const sets = await prisma.set.findMany({
    where: opts.setCode ? { code: opts.setCode } : undefined,
    select: { code: true, cardmarketExpansionId: true },
    orderBy: { code: "asc" },
  });

  const usable = sets.filter((s) => Number(s.cardmarketExpansionId) > 0);

  console.log(`🎯 Sync ALL sets (count=${usable.length}) dryRun=${dryRun}`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const s of usable) {
    const res = await syncOneSetPrices(String(s.code), Number(s.cardmarketExpansionId), opts);
    totalUpdated += res.updated;
    totalSkipped += res.skipped;
  }

  console.log(`\n🏁 DONE all sets: updated=${totalUpdated} skipped=${totalSkipped}`);
  return { totalUpdated, totalSkipped, sets: usable.length };
}

// important en script/cron
export async function disconnectPrisma() {
  await prisma.$disconnect();
}