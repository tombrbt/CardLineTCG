import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Nettoyage DB…");

  // Supprime d'abord les tables enfants (FK)
  await prisma.alias.deleteMany({});
  await prisma.ruling.deleteMany({});

  // Ensuite les cartes
  const delCards = await prisma.card.deleteMany({});
  console.log(`✅ Cartes supprimées: ${delCards.count}`);

  // Optionnel : supprimer aussi les sets (si tu veux repartir de zéro)
  const delSets = await prisma.set.deleteMany({});
  console.log(`✅ Sets supprimés: ${delSets.count}`);

  console.log("🎉 DB nettoyée.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });