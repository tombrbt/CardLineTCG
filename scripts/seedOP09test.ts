import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Import OP09…");

  const filePath = path.join(__dirname, "results/op09_final.json");
  const cards = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  // 1️⃣ Set OP09
  const set = await prisma.set.upsert({
    where: { code: "OP-09" },
    update: {},
    create: {
      code: "OP-09",
      name_en: "Emperors in the New World",
      name_fr: "Les Nouveaux Empereurs",
      releaseDate: new Date("2024-12-01"),
      type: "booster",
    },
  });

  // 2️⃣ Nettoyage cartes OP09 existantes (important)
  await prisma.card.deleteMany({
    where: { setId: set.id },
  });

  // 3️⃣ Insertion cartes
  for (const card of cards) {
    await prisma.card.create({
      data: {
        setId: set.id,
        name_en: card.name_fr, // temporaire
        name_fr: card.name_fr,
        name_jp: card.name_fr,
        type: card.type,
        color: card.color,
        cost: card.cost ?? 0,
        power: card.power ?? 0,
        rarity: card.rarity,
        illustrationUrl: card.variants[0]?.image ?? "",
        altIllustrationUrl: card.variants[1]?.image ?? null,
        text_en: "",
        text_fr: card.effect_fr ?? "",
        text_jp: "",
        status: "legal",
      },
    });
  }

  console.log(`✅ ${cards.length} cartes OP09 importées`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });