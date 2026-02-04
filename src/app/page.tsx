// // app/page.tsx
import CardList from "./components/CardList";

export default function Home() {
  return (
    <main className="flex-1 p-4 min-h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <h1 className="text-2xl font-bold mb-4">CardLine TCG</h1>
      <CardList /> {/* OK, pas de props */}
    </main>
  );
}
