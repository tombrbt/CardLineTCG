// /src/lib/setRules.ts

export type Variant = string;

function hasAll(set: Set<string>, items: string[]) {
  return items.every((x) => set.has(x));
}

/**
 * Donne l'ordre des variantes pour un code donné (sert à calculer V.1, V.2...).
 * - Par défaut: base, p1, p2, p3, p4, p5...
 *
 * - OP-13 global: si p2+p3+p4 existent => base, p1, p4, p2, p3
 *
 * - OP13-118 (spécial): on force base, p1, p4, p2, p3 (pour coller aux règles prix/badges)
 */
export function getVariantOrder(
  setCode: string | undefined,
  variantsPresent: Set<string>,
  cardCode?: string
): string[] {
  // ✅ RÈGLE ULTRA SPÉCIFIQUE : OP13-118
  if (setCode === "OP-13" && cardCode === "OP13-118") {
    // On ne renvoie que celles qui existent vraiment (sécurité)
    return ["base", "p1", "p4", "p2", "p3"].filter((v) => variantsPresent.has(v));
  }

  // ✅ RÈGLE OP-13 générale : seulement si p2+p3+p4 existent
  if (setCode === "OP-13" && hasAll(variantsPresent, ["p2", "p3", "p4"])) {
    return ["base", "p1", "p4", "p2", "p3"];
  }

  // défaut (stable et extensible)
  return ["base", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
}

/**
 * Rank d'une variante selon l'ordre du set.
 */
export function variantRank(
  setCode: string | undefined,
  variantsPresent: Set<string>,
  variant: string,
  cardCode?: string
) {
  const order = getVariantOrder(setCode, variantsPresent, cardCode);
  const v = variant && variant.length ? variant : "base";
  const idx = order.indexOf(v);
  return idx === -1 ? 999 : idx;
}