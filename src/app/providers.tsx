"use client"; // important : ce composant est côté client

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 1️⃣ Création du QueryClient
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
  gcTime: 1000 * 60 * 30,     // 30 min: garde en cache
      refetchOnWindowFocus: false,  // évite refetch au focus
      retry: 1,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

// 2️⃣ Fournir le QueryClient à tous les composants enfants
export function Providers({ children }: ProvidersProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}