import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const setCode = process.argv[2];
  if (!setCode) {
    console.error("Usage: npx tsx scripts/delete_set.ts OP-09");
    process.exit(1);
  }

  console.log(`🗑️ Suppression set ${setCode}...`);

  // Supprimer toutes les cartes liées (et donc Alias/Ruling si ON DELETE CASCADE)
  await prisma.card.deleteMany({
    where: { set: { code: setCode } },
  });

  // Supprimer le set lui-même
  await prisma.set.deleteMany({
    where: { code: setCode },
  });

  console.log("✅ Suppression terminée");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

