"use client";

import { useEffect, useMemo, useState } from "react";
import { LilCometCardBright } from "@/components/ui/lil-comet-card-bright";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from "next/image";


function badgeTooltipText(badgeText: string) {
  const map: Record<string, string> = {
    C: "Commune",
    UC: "Peu Commune",
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

  return map[badgeText] ?? badgeText;
}

type Badge = { text: string; tone: "neutral" | "blue" | "purple" | "gold" | "green" | "cyan" | "black" | "white" | "red" };

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

  // ✅ nouveau
  isSoloNonBase?: boolean;
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
    case "SP CARD":
      return "gold";

    default:
      return "neutral";
  }
}


function getBadges(card: any, rarityLabelFn: (r: string) => string, isSoloNonBase?: boolean): Badge[] {

// ===== OP13 DOYENS (p2 uniquement) =====
if ((card.code === "OP13-080" || card.code === "OP13-083" || card.code === "OP13-084" || card.code === "OP13-089" || card.code === "OP13-091") &&
  card.variant === "p2"
) {
  return [{ text: "Doyens", tone: "red" }];
}

  // ✅ RÈGLE SPÉCIALE OP13-118
if (card.code === "OP13-118" || card.code === "OP13-119" || card.code === "OP13-120") {
  if (card.variant === "p4") return [{ text: "SP", tone: "gold" }];

  if (card.variant === "p2" ) {
    return [{ text: "Manga", tone: "purple" }]; // ✅ Red Manga
  }
  if (card.variant === "p3" ) {
    return [{ text: "Red Manga", tone: "red" }]; // ✅ Red Manga
  }
}

  // ✅ Prioritaires d'abord
  if (card.variant === "p3") return [{ text: "SP", tone: "gold" }];
  if (card.rarity === "TR") return [{ text: "TR", tone: "gold" }];
  if (card.rarity === "SR SP") return [{ text: "SP", tone: "gold" }];



  if (card.variant === "p2") {
    // TR / SP CARD ne doivent jamais apparaître comme Manga
    if (card.rarity === "TR" || card.rarity === "SP CARD") {
      return [{ text: rarityLabelFn(card.rarity), tone: "gold" }];
    }
    return [{ text: "Manga", tone: "purple" }];


  }

  const badges: Badge[] = [];

  // ✅ "solo non-base" : on retire juste "Alternative"
  const canShowAlternative =
    card.variant === "p1" &&
    card.rarity !== "TR" &&
    card.rarity !== "SP CARD";


  if (canShowAlternative) {
    badges.push({ text: "Alt", tone: "black" });
  }

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
  isSoloNonBase,
}: CardTileProps) {
  const badges = useMemo(
    () => getBadges(card, rarityLabel, isSoloNonBase),
    [card, rarityLabel, isSoloNonBase]
  );

  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="pt-6 flex justify-center">
        <button
          type="button"
          onClick={onClick}
          className="relative w-44 sm:w-48 cursor-pointer focus:outline-none"
          aria-label={`Ouvrir ${card.name}`}
        >
          <LilCometCardBright className="w-full">
            <div
              className="relative rounded-xl overflow-hidden transition-all duration-300"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="relative from-zinc-900 to-zinc-950">
                {/* Wrapper image + skeleton */}
                <div className="relative">
                  {/* Skeleton */}
                  {!imgLoaded && (
                    <div className="absolute inset-0 rounded-xl bg-zinc-700 animate-pulse" />
                  )}

                  <Image
                    src={card.illustrationUrl}
                    alt={card.name}
                    width={240}
                    height={336}
                    sizes="(max-width: 640px) 176px, 192px"
                    quality={60}
                    loading="lazy"
                    className={[
                      "w-full h-full object-contain transition-opacity duration-300",
                      imgLoaded ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                    style={{ transform: "translateZ(10px)" }}
                    onLoad={() => setImgLoaded(true)}
                  />

                </div>

                <div
                  className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500"
                  style={{ transform: "translateZ(1px)" }}
                />
              </div>
            </div>
          </LilCometCardBright>

          <div className="mt-2 px-1 py-1 w-full h-12 flex flex-col justify-between">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-xs font-medium text-white truncate" title={card.name}>
                {card.name}
              </h3>

              <TooltipProvider delayDuration={10}>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {badges.map((b, i) => (
                    <Tooltip key={`${b.text}-${i}`}>
                      <TooltipTrigger asChild>
                        <span
                          className={badgeClass(b.tone)}
                          title={badgeTooltipText(b.text)}
                        >
                          {b.text}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="text-xs px-2 py-1 bg-zinc-900 text-zinc-100 border border-zinc-700"
                      >
                        {badgeTooltipText(b.text)}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>

            <div className="flex justify-between items-end text-[11px] text-zinc-500 font-mono">
              <span>{card.code}</span>
              <span className="opacity-60">{variantLabel} </span>
            </div>
          </div>

          <div
            className="w-full h-6 mx-auto -mt-1 bg-gradient-to-b from-black/20 to-transparent rounded-full blur-sm opacity-0 hover:opacity-100 transition-opacity duration-300"
            style={{ transform: "scaleX(0.85) translateY(-50%)" }}
          />
        </button>
      </div>
    </div>
  );
}