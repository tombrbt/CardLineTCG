import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Usage:
// npx tsx scripts/seed_from_flat.ts OP-09 scripts/results/OP-09_flat.json

async function main() {
  const setCode = process.argv[2];
  const jsonPath = process.argv[3];

  if (!setCode || !jsonPath) {
    console.error("Usage: npx tsx scripts/seed_from_flat.ts OP-09 scripts/results/OP-final.json");
    process.exit(1);
  }

  const absPath = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
  const rows = JSON.parse(fs.readFileSync(absPath, "utf-8"));

  console.log(`🔄 Import ${setCode} depuis ${jsonPath}…`);
  console.log(`📦 Lignes: ${rows.length}`);

  // Set (tu peux ajuster releaseDate plus tard)
  const set = await prisma.set.upsert({
    where: { code: setCode },
    update: {},
    create: {
      code: setCode,
      name_fr: setCode === "OP-09" ? "Les Nouveaux Empereurs" : setCode,
      name_en: setCode === "OP-09" ? "Emperors in The New World" : setCode,
      releaseDate: new Date("2024-12-01"),
      type: "booster",
    },
  });

  // Nettoyage du set (reimport safe)
  await prisma.alias.deleteMany({ where: { card: { setId: set.id } } });
  await prisma.ruling.deleteMany({ where: { card: { setId: set.id } } });
  await prisma.card.deleteMany({ where: { setId: set.id } });

  // Insert
  for (const c of rows) {
    await prisma.card.create({
      data: {
        setId: set.id,
        code: c.code,
        variant: c.variant ?? "base",
        name: c.name,
        type: c.type,
        color: c.color,
        costOrLife: c.costOrLife ?? 0,
        power: c.power ?? 0,
        counter: c.counter ?? null,
        rarity: c.rarity,
        block: c.block ?? null,
        feature: c.feature ?? null,
        text: c.text ?? null,
        illustrationUrl: c.illustrationUrl,
        status: c.status ?? "legal",
      },
    });
  }

  console.log(`✅ Import terminé: ${rows.length} cartes/variantes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });