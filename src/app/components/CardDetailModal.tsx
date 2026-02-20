"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CometCardBright } from "@/components/ui/comet-card-bright";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";



type CardDetailModalProps = {
  cardId: number | null;
  cardIds: number[]; // liste des cartes actuellement affichées
  onClose: () => void;
  onNavigate: (id: number) => void;
};

type CardResponse = {
  success: boolean;
  card?: any;
  error?: string;
};

function isEmpty(v: any) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function formatVariantLabel(variant: string) {
  if (!variant || variant === "base") return "";
  return ` (${variant.toUpperCase()})`;


}

function formatRarity(
  rarity: string,
  variant: string,
  setCode?: string,
  cardCode?: string
) {
  if (!rarity) return "";

  const rarityMap: Record<string, string> = {
    C: "Commune",
    UC: "Non Commune",
    R: "Rare",
    SR: "Super Rare",
    L: "Leader",
    SEC: "Secrète",
    TR: "Treasure Rare",
    "SP CARD": "Spécial",
    P: "Promos"
  };

  const translatedRarity = rarityMap[rarity] ?? rarity;

   // ✅ RÈGLE SPÉCIALE OP13-118 (uniquement dans la modal)
   if (setCode === "OP-13" && cardCode === "OP13-080" || cardCode === "OP13-083" || cardCode === "OP13-084" || cardCode === "OP13-089" || cardCode === "OP13-091") {
    if (variant === "p2") return "Cinq Doyens";
    // base / p1 => comportement normal
  }
  // ✅ RÈGLE SPÉCIALE OP13-118 (uniquement dans la modal)
  if (setCode === "OP-13" && cardCode === "OP13-118" || cardCode === "OP13-119" || cardCode === "OP13-120") {
    if (variant === "p2") return "Manga";
    if (variant === "p3") return "Red Manga";
    if (variant === "p4") return "Spécial";
    // base / p1 => comportement normal
  }

  // ✅ EXCEPTION : bonus TR / SP CARD en p1/p2 => pas de texte "Alternative/Manga"
  if ((variant === "p1" || variant === "p2") && (rarity === "TR" || rarity === "SP CARD")) {
    return translatedRarity;
  }

  // ✅ Règles variantes (générales)
  if (variant === "p1") return `${translatedRarity} (Alternative)`;
  if (variant === "p2") return "Manga";
  if (variant === "p3") return "Spécial";

  return translatedRarity;
}


export default function CardDetailModal({ cardId, cardIds, onClose, onNavigate }: CardDetailModalProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  const currentIndex = useMemo(() => {
    if (!cardId) return -1;
    return cardIds.indexOf(cardId);
  }, [cardId, cardIds]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < cardIds.length - 1;

  const goPrev = () => {
    if (!hasPrev) return;
    onNavigate(cardIds[currentIndex - 1]);
  };

  const goNext = () => {
    if (!hasNext) return;
    onNavigate(cardIds[currentIndex + 1]);
  };

  // 1) ESC = fermer (si zoom ouvert -> ferme le zoom d'abord)
  // 2) flèches = prev/next (si zoom ouvert -> ignore)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!cardId) return;

      if (e.key === "Escape") {
        if (zoomOpen) setZoomOpen(false);
        else onClose();
        return;
      }

      if (zoomOpen) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardId, zoomOpen, hasPrev, hasNext, currentIndex, cardIds, onClose]); // ok

  // Préchargement des cartes

  const queryClient = useQueryClient();
  

  const prefetchCard = (id: number) => {
    queryClient.prefetchQuery({
      queryKey: ["card", id],
      queryFn: async () => {
        const res = await fetch(`/api/cards/${id}`);
        if (!res.ok) throw new Error("Erreur API");
        return res.json();
      },
      staleTime: 1000 * 60 * 10,
    });
  };

  useEffect(() => {
    if (!cardId) return;
    const nextId = cardIds[currentIndex + 1];
    const prevId = cardIds[currentIndex - 1];
    if (nextId) prefetchCard(nextId);
    if (prevId) prefetchCard(prevId);
  }, [cardId, currentIndex, cardIds]);

  // Bloquer le scroll derrière la modal
  useEffect(() => {
    if (!cardId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cardId]);

  const { data, isLoading, isError } = useQuery<CardResponse>({
    
    queryKey: ["card", cardId],
    enabled: !!cardId,
    queryFn: async () => {
      const res = await fetch(`/api/cards/${cardId}`);
      return res.json();
    },
  });

  if (!cardId) return null;

  const card = data?.card;

  const extensionLabel =
    card?.set && !isEmpty(card.set?.name_fr) && !isEmpty(card.set?.code)
      ? `${card.set.name_fr} (${card.set.code})`
      : card?.set?.name_fr ?? card?.set?.code ?? null;

      return (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {/* backdrop (clic dehors => fermer) */}
          <motion.div
            className="absolute inset-0 bg-white/60"
            onClick={() => {
              if (zoomOpen) setZoomOpen(false);
              else onClose();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />
      
          {/* modal */}
          <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl mx-auto max-h-[92vh] rounded-lg bg-zinc-800 text-gray-300 shadow-xl flex flex-col"
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {/* top actions */}
              <div className="sticky top-0 z-10 bg-white px-4 pt-3 bg-zinc-800 flex items-center justify-end">
                <button
                  onClick={() => {
                    if (zoomOpen) setZoomOpen(false);
                    else onClose();
                  }}
                  className="rounded px-3 py-1 text-sm border text-gray-300 hover:text-zinc-800 hover:bg-gray-300"
                >
                  ✕
                </button>
              </div>
      
              <div className="flex-1 overflow-y-auto p-6">
                {isLoading && <div>Chargement…</div>}
                {isError && <div>Erreur de chargement.</div>}
                {!isLoading && data && !data.success && (
                  <div>Carte introuvable : {data.error ?? "Erreur inconnue"}</div>
                )}
      
                {/* ✅ ton animation interne (suivant/précédent) tu la gardes */}
                <AnimatePresence mode="wait">
                  {!isLoading && data?.success && card && (
                    <motion.div
                      key={card.id}
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="flex gap-6 flex-col md:flex-row"
                    >
                      {/* Image */}
                      <div className="md:w-80">
                        <CometCardBright>
                          <button
                            type="button"
                            className="w-full cursor-pointer rounded-lg bg-black/5 p-1"
                            onClick={() => setZoomOpen(true)}
                            title="Cliquer pour zoomer"
                            style={{ transformStyle: "preserve-3d" }}
                          >
                            <img
                              src={card.illustrationUrl}
                              alt={card.name}
                              className="w-full rounded-md object-contain"
                              style={{
                                transform: "translateZ(10px)",
                                boxShadow: "rgba(0, 0, 0, 0.15) 0px 10px 18px 0px",
                              }}
                            />
                          </button>
                        </CometCardBright>
      
                        <div className="text-xs text-gray-500 mt-2">
                          Clique sur l’image pour zoomer
                        </div>
                      </div>
      
                      {/* Infos */}
                      <div className="flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                          <div>
                            <div className="text-xs uppercase text-gray-500">Code</div>
                            <div className="text-lg font-semibold">{card.code}</div>
                          </div>
      
                          <div>
                            <div className="text-xs uppercase text-gray-500">Nom</div>
                            <div className="text-lg font-semibold">{card.name}</div>
                          </div>
      
                          {!isEmpty(extensionLabel) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Extension</div>
                              <div>{extensionLabel}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.rarity) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Rareté</div>
                              <div>{formatRarity(card.rarity, card.variant, card.set?.code, card.code)}</div>                            </div>
                          )}
      
                          {!isEmpty(card.type) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Type</div>
                              <div>{card.type}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.feature) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Famille</div>
                              <div>{card.feature}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.power) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Puissance</div>
                              <div>{card.power}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.costOrLife) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Coût / Vie</div>
                              <div>{card.costOrLife}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.color) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Couleur</div>
                              <div>{card.color}</div>
                            </div>
                          )}
      
                          {!isEmpty(card.block) && (
                            <div>
                              <div className="text-xs uppercase text-gray-500">Bloc</div>
                              <div>{card.block}</div>
                            </div>
                          )}
                        </div>
      
                        {!isEmpty(card.text) && (
                          <div className="mt-4 leading-relaxed text-sm">
                            <div className="text-xs uppercase text-gray-500">Effet</div>
                            <div className="whitespace-pre-wrap leading-relaxed">{card.text}</div>
                          </div>
                        )}
      
                        {card.price && (
                          <div className="mt-6 rounded-lg border bg-black/5 p-4">
                            <div className="text-xs uppercase text-gray-500">Prix Cardmarket</div>
      
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-xs text-gray-500">Bas</div>
                                <div className="font-semibold">
                                  {card.price.lowPrice != null ? `${card.price.lowPrice.toFixed(2)} €` : "—"}
                                </div>
                              </div>
      
                              <div>
                                <div className="text-xs text-gray-500">Tendance</div>
                                <div className="font-semibold">
                                  {card.price.trendPrice != null ? `${card.price.trendPrice.toFixed(2)} €` : "—"}
                                </div>
                              </div>
      
                              <div>
                                <div className="text-xs text-gray-500">Moy. 7j</div>
                                <div className="font-semibold">
                                  {card.price.avg7 != null ? `${card.price.avg7.toFixed(2)} €` : "—"}
                                </div>
                              </div>
      
                              <div>
                                <div className="text-xs text-gray-500">Moy. 30j</div>
                                <div className="font-semibold">
                                  {card.price.avg30 != null ? `${card.price.avg30.toFixed(2)} €` : "—"}
                                </div>
                              </div>
                            </div>
      
                            <div className="mt-3 text-xs text-gray-500">
                              Dernière mise à jour :{" "}
                              {card.price.updatedAt ? new Date(card.price.updatedAt).toLocaleString("fr-FR") : "—"}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
      
                {/* ✅ Footer fixe */}
                {(hasPrev || hasNext) && (
                  <div className="bg-zinc-800 backdrop-blur mt-4 flex justify-end gap-2">
                    <button
                      onClick={goPrev}
                      disabled={!hasPrev}
                      className="px-4 py-2 border hover:text-zinc-800 hover:bg-gray-300 rounded disabled:opacity-40"
                    >
                      ← Précédent
                    </button>
      
                    <button
                      onClick={goNext}
                      disabled={!hasNext}
                      className="px-4 py-2 border hover:text-zinc-800 hover:bg-gray-300 rounded disabled:opacity-40"
                    >
                      Suivant →
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
      
          {/* ZOOM overlay */}
          {zoomOpen && card?.illustrationUrl && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/80" onClick={() => setZoomOpen(false)} />
      
              <img
                src={card.illustrationUrl}
                alt={card.name}
                className="relative max-h-[70vh] max-w-[70vw] object-contain cursor-zoom-out"
                onClick={(e) => e.stopPropagation()}
              />
      
              <button
                onClick={() => setZoomOpen(false)}
                className="absolute top-4 right-4 bg-black hover:bg-white/10 text-white px-3 py-1 border rounded"
              >
                ✕
              </button>
            </div>
          )}
        </motion.div>
      );
} 