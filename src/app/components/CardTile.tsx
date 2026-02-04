"use client";

import { useMemo } from "react";

type Badge = { text: string; tone: "neutral" | "blue" | "purple" | "gold" | "green"| "cyan" | "black"| "white"| "red" };

type CardTileProps = {
  card: {
    id: number;
    name: string;
    code: string;
    variant: string; // base, p1, p2, p3...
    rarity: string;
    illustrationUrl: string;
  };
  // label calculé au niveau liste (car dépend des variantes existantes)
  variantLabel?: string | null; // ex: "V.1"
  onClick: () => void;

  // si tu veux afficher des labels de rareté plus humains
  rarityLabel?: (r: string) => string;
};

function defaultRarityLabel(r: string) {
  return r;
}

function rarityTone(r: string): Badge["tone"] {
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
    default:
      return "neutral";
  }
}

// ====== TES RÈGLES BADGES (copié/aligné) ======
function getBadges(card: any, rarityLabelFn: (r: string) => string): Badge[] {
  const badges: Badge[] = [];

  // Variants OP-09 (prioritaires)
  if (card.variant === "p3") {
    return [{ text: "SP", tone: "gold" }];
  }

  if (card.variant === "p2") {
    return [{ text: "Manga", tone: "purple" }];
  }

  if (card.variant === "p1") {
    badges.push({ text: "Alternative", tone: "black" });
  }

  // Badge de rareté (toujours affiché sauf p3)
  if (card.rarity) {
    badges.push({
      text: rarityLabelFn(card.rarity),
      tone: rarityTone(card.rarity),
    });
  }

  return badges;
}

function badgeClass(tone: Badge["tone"]) {
  const base =
    "text-xs font-bold px-1.5 py-0.5 rounded border";
  switch (tone) {
    case "blue":
      return `${base} bg-blue-900/40
                  border-blue-700/30
                  text-blue-300`;
    case "purple":
      return `${base} bg-purple-900/40
                  border-purple-700/30
                  text-purple-300`;
    case "gold":
      return `${base} bg-yellow-900/40
                  border-yellow-700/30
                  text-yellow-300`;
    case "red":
      return `${base} bg-red-900/40
                  border-red-700/30
                  text-red-300`;
    case "cyan":
      return `${base} bg-cyan-900/40
                  border-cyan-700/30
                  text-cyan-300`;
    case "green":
      return `${base} bg-green-900/40
                  border-green-700/30
                  text-green-300`;

    case "black":
      return `${base} bg-stone-900/40
                  border-stone-700/30
                  text-stone-300`;

    default:
      return `${base} bg-gray-50 text-gray-700 border-gray-200`;
  }
}

export default function CardTile({
  card,
  onClick,
  variantLabel,
  rarityLabel = defaultRarityLabel,
}: CardTileProps) {
  const badges = useMemo(() => getBadges(card, rarityLabel), [card, rarityLabel]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="p-3 flex justify-center">
        <button
          type="button"
          onClick={onClick}
          className="relative w-44 sm:w-48 cursor-pointer focus:outline-none"
          aria-label={`Ouvrir ${card.name}`}
        >
          <div
            className="
              relative rounded-xl overflow-hidden transition-all duration-300
              shadow-md hover:shadow-xl hover:-translate-y-0.5
            "
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="relative aspect-[2/3] bg-gradient-to-b from-zinc-900 to-zinc-950">
              <img
                alt={card.name}
                loading="lazy"
                className="w-full h-full object-contain"
                src={card.illustrationUrl}
              />

              {/* Badge V.x (si fourni)
              {variantLabel && (
                <div className="absolute top-1 right-1 bg-black/70 backdrop-blur text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                  {variantLabel}
                </div>
              )} */}

              <div
                className="
                  absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent
                  opacity-0 hover:opacity-100 transition-opacity duration-500
                "
                style={{ transform: "translateZ(1px)" }}
              />
            </div>
          </div>

          <div className="mt-2 px-1 py-1 w-full h-12 flex flex-col justify-between">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-xs font-medium text-white truncate" title={card.name}>
                {card.name}
              </h3>

              {/* Badges alignés en face du nom */}
              <div className="flex flex-wrap gap-1 justify-end shrink-0">
                {badges.map((b, i) => (
                  <span key={`${b.text}-${i}`} className={badgeClass(b.tone)}>
                    {b.text}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-end text-[11px] text-zinc-500 font-mono">
              <span>{card.code}</span>
              {/* petit hint optionnel à droite (tu peux enlever si tu veux) */}
              <span className="opacity-60">{variantLabel} </span>
            </div>
          </div>

          <div
            className="
              w-full h-6 mx-auto -mt-1 bg-gradient-to-b from-black/20 to-transparent
              rounded-full blur-sm opacity-0 hover:opacity-100 transition-opacity duration-300
            "
            style={{ transform: "scaleX(0.85) translateY(-50%)" }}
          />
        </button>
      </div>
    </div>
  );
}