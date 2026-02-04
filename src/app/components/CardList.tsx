"use client";

import { useState, useDeferredValue, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import CardDetailModal from "./CardDetailModal";
import { useQueryClient } from "@tanstack/react-query";
import CardTile from "./CardTile";






function rarityLabel(r: string) {
  const map: Record<string, string> = {
    C: "C",
    UC: "UC",
    R: "R",
    SR: "SR",
    L: "L",
    SEC: "SEC",
  };
  return map[r] ?? r;
}





type CardsResponse = {
  success: boolean;
  cards: any[];
  total?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
};

export default function CardList() {
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);
  const [color, setColor] = useState("");
  const [type, setType] = useState("");
  const [rarity, setRarity] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [setCode, setSetCode] = useState(""); // ex: "OP-09"
  const [family, setFamily] = useState("");
  
  

  const resetFilters = () => {
    setSearchInput("");
    setColor("");
    setType("");
    setRarity("");
    setFamily("");
    setPage(1);
  
    // si tu as aussi ces states :
    // setSetCode("OP-09");  // ou ""
    // setSort("code_asc");  // si tu gères un tri
  };

  const hasFilters =
  searchInput || color || type || rarity || family || page !== 1; // + setCode/sort si tu veux

  const getUrl = () => {
    const params = new URLSearchParams();
    if (deferredSearch) params.append("search", deferredSearch);
    if (color) params.append("color", color);
    if (type) params.append("type", type);
    if (rarity) params.append("rarity", rarity);
    if (family) params.append("family", family);
    

    // if (setCode) params.append("set", setCode);
    // if (sort) params.append("sort", sort);

    params.append("page", String(page));
    params.append("pageSize", "24");

    return `/api/cards?${params.toString()}`;
  };

  const { data, isLoading, isError, error, isFetching } = useQuery<CardsResponse>({
    queryKey: ["cards", deferredSearch, color, type, rarity, family, page, setCode],
    queryFn: async () => {
      const res = await fetch(getUrl());
      if (!res.ok) throw new Error(`Erreur API (${res.status})`);
      return (await res.json()) as CardsResponse;
    },
    placeholderData: (prev) => prev, // garde l’ancien résultat pendant le fetch
  });


  type FamiliesResponse = { success: boolean; families: string[] };

const { data: famData } = useQuery<FamiliesResponse>({
  queryKey: ["families", setCode], // setCode = ton select d’extension si tu l’as, sinon "OP-09"
  queryFn: async () => {
    const res = await fetch(`/api/meta/families?set=${encodeURIComponent(setCode || "OP-09")}`);
    if (!res.ok) throw new Error("Erreur API families");
    return res.json();
  },
}); 

  const cards = data?.cards ?? [];
  const totalPages = data?.totalPages ?? 1;
  const cardIds = data?.cards?.map((c: any) => c.id) ?? [];

  // 1) map code -> set des variants présents dans la liste actuelle
  const variantsByCode = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of cards) {
      const code = String(c.code);
      if (!m.has(code)) m.set(code, new Set());
      m.get(code)!.add(String(c.variant || "base"));
    }
    return m;
  }, [cards]);

  // 2) mapping variant -> V.x selon tes règles
  function getVLabel(code: string, variant: string) {
    const set = variantsByCode.get(code);
    const hasP3 = set?.has("p3") ?? false;

    if (!variant || variant === "base") return "V.1";
    if (variant === "p1") return "V.2";

    if (hasP3) {
      // cas avec V.4 existante : V.3 = p3, V.4 = p2
      if (variant === "p3") return "V.3";
      if (variant === "p2") return "V.4";
    } else {
      // cas sans p3 : V.3 = p2
      if (variant === "p2") return "V.3";
    }

    return null;
  }

  const queryClient = useQueryClient();

  const getUrlForPage = (p: number) => {
    const params = new URLSearchParams();
  
    if (deferredSearch) params.append("search", deferredSearch);
    if (color) params.append("color", color);
    if (type) params.append("type", type);
    if (rarity) params.append("rarity", rarity);
    if (family) params.append("family", family);
  
    params.append("page", p.toString());
    params.append("pageSize", "24");
  
    return `/api/cards?${params.toString()}`;
  };

  useEffect(() => {
    if (!data) return;
  
    // Si la page n'est pas pleine, il n’y a probablement pas de page suivante
    const hasNext = data.cards.length === 24;
    if (!hasNext) return;
  
    const nextPage = page + 1;
  
    queryClient.prefetchQuery({
      queryKey: [
        "cards",
        deferredSearch,
        color,
        type,
        rarity,
        family,
        nextPage,
      ],
      queryFn: async () => {
        const res = await fetch(getUrlForPage(nextPage));
        if (!res.ok) throw new Error("Erreur API");
        return res.json();
      },
      staleTime: 1000 * 60 * 5,
    });
  }, [data, page, deferredSearch, color, type, rarity, family, queryClient]);

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


  return (
    <div className="p-4 flex-1 container mx-auto px-4 py-8">
      <div className="relative flex-1 mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>
      {/* INPUT */}
  
      <input
        type="text"
        value={searchInput}
        onChange={(e) => {
          setSearchInput(e.target.value);
          setPage(1);
        }}
        placeholder="Rechercher une carte..."
        className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
      />
      </div>
      {/* Filtres */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
      

        <select value={setCode} onChange={(e) => { setSetCode(e.target.value); setPage(1); }} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50">
          <option value="">Extension</option>
          <option value="OP-09">Les Nouveaux Empereurs (OP-09)</option>
        </select>

        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50">
          <option value="">Type</option>
          <option value="LEADER">Leader</option>
          <option value="PERSONNAGE">Personnage</option>
          <option value="ÉVÉNEMENTS">Événement</option>
          <option value="LIEU">Lieu</option>
        </select>

        <select value={rarity} onChange={(e) => { setRarity(e.target.value); setPage(1); }} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50">
          <option value="">Rareté</option>
          <option value="C">Commune</option>
          <option value="UC">Peu Commune</option>
          <option value="R">Rare</option>
          <option value="SR">Super Rare</option>
          <option value="L">Leader</option>
          <option value="SEC">Secrète</option>
          <option value="SP CARD">SP</option>
          <option value="MANGA">Manga</option>
        </select>


        <select value={color} onChange={(e) => { setColor(e.target.value); setPage(1); }} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50">
          <option value="">Couleur</option>
          <option value="Rouge">Rouge</option>
          <option value="Bleu">Bleu</option>
          <option value="Vert">Vert</option>
          <option value="Jaune">Jaune</option>
          <option value="Noir">Noir</option>
        </select>

        <select
          value={family}
          onChange={(e) => { setFamily(e.target.value); setPage(1); }}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50"
        >
          <option value="">Famille</option>
          {(famData?.families ?? []).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasFilters}
          className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md"
        >
          Réinitialiser les filtres
        </button>

        <div className="flex gap-2 flex-wrap">


      </div>
      </div>

      {/* Etat */}
      {isLoading && <div>Chargement…</div>}
      {isError && <div>Erreur : {(error as Error).message}</div>}
      {isFetching && !isLoading && <div className="text-sm text-gray-500 mb-2">Mise à jour…</div>}

 

<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mt-6">
  {cards.map((card: any) => (
    <CardTile
    key={card.id}
    card={card}
    variantLabel={getVLabel(card.code, card.variant)}
    onClick={() => setSelectedCardId(card.id)}
    rarityLabel={rarityLabel}
  />
  ))}
</div>
      {/* Pagination */}
      <div className="mt-6 flex justify-center gap-2 items-center">
        <button
          className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md hover:text-zinc-800 hover:bg-gray-300  disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Précédent
        </button>

        <span className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md">
          {page} / {totalPages}
        </span>

        <button
          className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md hover:text-zinc-800 hover:bg-gray-300  disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </button>

        
        </div>
          <CardDetailModal
          cardId={selectedCardId}
          cardIds={cardIds}
          onClose={() => setSelectedCardId(null)}
          onNavigate={(id) => setSelectedCardId(id)}
        />
    </div>
    
  );

} 