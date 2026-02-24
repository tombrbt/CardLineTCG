// /scripts/sync_cardmarket_prices_all.ts
import { disconnectPrisma, syncAllSetsPrices } from "./sync_cardmarket_prices_core";

const DRY_RUN = (process.env.DRY_RUN || "").toLowerCase() === "true";
const ONLY_SET = (process.env.ONLY_SET || "").trim(); // optionnel
const VERBOSE = (process.env.VERBOSE || "").toLowerCase() === "true";

async function main() {
  await syncAllSetsPrices({
    dryRun: DRY_RUN,
    setCode: ONLY_SET || undefined,
    verbose: VERBOSE,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => disconnectPrisma());
  