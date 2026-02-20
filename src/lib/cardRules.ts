// /src/lib/cardRules.ts

export type Tone =
  | "neutral"
  | "blue"
  | "purple"
  | "gold"
  | "green"
  | "cyan"
  | "black"
  | "white"
  | "red";

export type Badge = { text: string; tone: Tone };

// ✅ Regex Cardmarket: (OP|ST|EB|PRB)xx-xxx
export function extractCodeFromProductName(name: string): string | null {
  const m = name.match(/\(((?:OP|ST|EB|PRB)\d{2}-\d{3})\)/i);
  return m ? m[1].toUpperCase() : null;
}

function hasAll(set: Set<string>, items: string[]) {
  return items.every((x) => set.has(x));
}

/**
 * Ordre des variantes pour l'affichage V.1, V.2... (UI).
 * ⚠️ IMPORTANT : on renvoie un ordre "théorique", et ensuite on filtre sur variantsPresent côté appelant.
 */
export function getVariantOrder(
  setCode: string | undefined,
  variantsPresent: Set<string>,
  cardCode?: string
): string[] {
  // ✅ OP13-118 (ultra spécifique)
  if (setCode === "OP-13" && cardCode === "OP13-118") {
    return ["base", "p1", "p4", "p2", "p3"].filter((v) => variantsPresent.has(v));
  }

  // ✅ OP-13 global: si p2+p3+p4 existent => base, p1, p4, p2, p3
  if (setCode === "OP-13" && hasAll(variantsPresent, ["p2", "p3", "p4"])) {
    return ["base", "p1", "p4", "p2", "p3"];
  }

  // défaut (stable et extensible)
  return ["base", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].filter((v) =>
    variantsPresent.has(v)
  );
}

/**
 * Rarete affichée dans la MODAL (ton formatRarity centralisé ici).
 * Retourne un label prêt à afficher.
 */
export function formatRarityForModal(
  setCode: string | undefined,
  cardCode: string | undefined,
  rarity: string,
  variant: string
): string {
  if (!rarity) return "";

  const rarityMap: Record<string, string> = {
    C: "Commune",
    UC: "Non Commune",
    R: "Rare",
    SR: "Super Rare",
    L: "Leader",
    SEC: "Secrète",
    TR: "Treasure Rare",
    SP: "Spécial",
    Alt: "Alternative",
    Doyens: "Cinq Doyens",
    P: "Promos",
    "SP CARD": "Spécial",
  };

  const translated = rarityMap[rarity] ?? rarity;

  // ✅ bonus: TR / SP CARD en p1/p2 => pas Alternative / pas Manga
  if ((variant === "p1" || variant === "p2") && (rarity === "TR" || rarity === "SP CARD")) {
    return translated;
  }

  // ✅ OP13-118: règles exactes modal
  if (setCode === "OP-13" && cardCode === "OP13-118") {
    if (variant === "p2") return "Manga";
    if (variant === "p3") return "Red Manga";
    if (variant === "p4") return "Spécial";
  }

  // ✅ OP-13: 5 doyens (p2)
  if (setCode === "OP-13" && variant === "p2") {
    const doyens = new Set(["OP13-080", "OP13-083", "OP13-084", "OP13-089", "OP13-091"]);
    if (cardCode && doyens.has(cardCode)) return "Cinq Doyens";
  }

  // règles variantes générales
  if (variant === "p1") return `${translated} (Alternative)`;
  if (variant === "p2") return "Manga";
  if (variant === "p3") return "Spécial";

  return translated;
}

/**
 * Badges centralisés (CardTile).
 * - Tu peux y ajouter toutes tes exceptions sans toucher CardTile.tsx.
 */
export function getBadgesForTile(params: {
  setCode?: string;
  cardCode?: string;
  variant: string;
  rarity: string;
  rarityLabelFn: (r: string) => string;
  isSoloNonBase?: boolean;
}): Badge[] {
  const { setCode, cardCode, variant, rarity, rarityLabelFn, isSoloNonBase } = params;

  // ✅ “solo non-base” => juste la rareté en gold
  if (isSoloNonBase) {
    return [{ text: rarityLabelFn(rarity), tone: "gold" }];
  }

  // ✅ p3 = SP (prioritaire)
  if (variant === "p3") return [{ text: "SP", tone: "gold" }];

  // ✅ TR = TR (prioritaire)
  if (rarity === "TR") return [{ text: "TR", tone: "gold" }];

  // ✅ OP-13: 5 doyens -> badge Doyens en rouge si p2
  if (setCode === "OP-13" && variant === "p2") {
    const doyens = new Set(["OP13-080", "OP13-083", "OP13-084", "OP13-089", "OP13-091"]);
    if (cardCode && doyens.has(cardCode)) {
      return [{ text: "Doyens", tone: "red" }];
    }
  }

  // ✅ OP13-118: badges particuliers
  if (setCode === "OP-13" && cardCode === "OP13-118" || cardCode === "OP13-119" || cardCode === "OP13-120") {
    if (variant === "p4") return [{ text: "SP", tone: "gold" }];
    if (variant === "p2") return [{ text: "Manga", tone: "red" }];      // Red Manga (V.4)
    if (variant === "p3") return [{ text: "Red Manga", tone: "red" }];   // V.5
  }

  // ✅ p2 = Manga sauf TR/SP CARD
  if (variant === "p2") {
    if (rarity === "TR" || rarity === "SP CARD") {
      return [{ text: rarityLabelFn(rarity), tone: "gold" }];
    }
    return [{ text: "Manga", tone: "purple" }];
  }

  const badges: Badge[] = [];

  // ✅ Alternative (p1) MAIS PAS TR / SP CARD
  if (variant === "p1" && rarity !== "TR" && rarity !== "SP CARD") {
    badges.push({ text: "Alternative", tone: "black" });
  }

  // ✅ badge rareté
  if (rarity) badges.push({ text: rarityLabelFn(rarity), tone: rarityTone(rarity) });

  return badges;
}

export function rarityTone(r: string): Badge["tone"] {
  switch (r) {
    case "C":
      return "neutral";
    case "UC":
      return "green";
    case "R":
      return "blue";
    case "SR":
      return "cyan";
    case "L":
      return "red";
    case "SEC":
      return "gold";
    case "SP CARD":
      return "gold";
    default:
      return "neutral";
  }
}

/**
 * ✅ Mapping prix CardMarket (index dans candidates triées par idProduct)
 * - si override existe => on l'utilise
 * - sinon => on mappe par ordre UI (getVariantOrder)
 */
export function getPriceCandidateIndex(params: {
  setCode: string;
  cardCode: string;
  variant: string;
  variantsPresent: Set<string>;
  candidateCount: number;
}): number {
  const { setCode, cardCode, variant, variantsPresent, candidateCount } = params;

  // ---- Overrides par carte ----

  // OP13-118 : base=0 p1=1 p4=2 p2=3 p3=4
  if (setCode === "OP-13" && cardCode === "OP13-118") {
    if (!variant || variant === "base") return 0;
    if (variant === "p1") return 1;
    if (variant === "p4") return 2;
    if (variant === "p2") return 3;
    if (variant === "p3") return 4;
    return 0;
  }

  // OP13-119 (Ace) : tu m’as dit p2/p3 décalés => on le fix ici quand tu valides les indices exacts
  // ⚠️ placeholder: à ajuster une fois que tu donnes "qui correspond à quoi" en index V.x réel (candidates triées)
  // if (setCode === "OP-13" && cardCode === "OP13-119") { ... }

  // ---- Fallback générique ----
  const order = getVariantOrder(setCode, variantsPresent, cardCode);
  const v = variant && variant.length ? variant : "base";
  const idx = order.indexOf(v);
  if (idx === -1) return 0;

  // garde-fou si candidates manquent
  return Math.min(idx, Math.max(0, candidateCount - 1));
}