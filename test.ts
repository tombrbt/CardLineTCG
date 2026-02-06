import { prisma } from "./src/lib/prisma";

async function testRelations() {
  const card = await prisma.card.findFirst(); // prend la première carte

  // Création d’un alias temporaire
  const alias = await prisma.alias.create({
    data: {
      cardId: card!.id,
      aliasText: "Luffy Test",
      language: "FR",
    },
  });

  // Création d’un ruling temporaire
  const ruling = await prisma.ruling.create({
    data: {
      cardId: card!.id,
      rulingText: "Test Ruling: cette carte est légale.",
      date: new Date(),
    },
  });

  // Vérification : récupérer la carte avec ses alias et rulings
  const fullCard = await prisma.card.findUnique({
    where: { id: card!.id },
    include: { set: true, aliases: true, rulings: true },
  });

  console.log(JSON.stringify(fullCard, null, 2));
}

testRelations()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());