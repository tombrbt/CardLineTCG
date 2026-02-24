import { NextResponse } from "next/server";
import { syncAllSetsPrices, disconnectPrisma } from "@/../scripts/sync_cardmarket_prices_core";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // 🔐 Sécurité : vérifier le secret
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("⏰ CRON: Starting price sync...");

    const result = await syncAllSetsPrices({
      dryRun: false,
      verbose: false,
    });

    await disconnectPrisma();

    console.log("✅ CRON: Sync finished", result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("❌ CRON ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}