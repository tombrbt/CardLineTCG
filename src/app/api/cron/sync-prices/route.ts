// import { NextResponse } from "next/server";
// import { syncAllSetsPrices, disconnectPrisma } from "@/../scripts/sync_cardmarket_prices_core";


// export async function GET(req: Request) {
//   try {
//     console.log("CRON_SECRET env:", process.env.CRON_SECRET);

//     const authHeader = req.headers.get("authorization");
//     console.log("Auth header:", authHeader);

//     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized" },
//         { status: 401 }
//       );
//     }
//     console.log("⏰ CRON: Starting daily price sync...");

//     const result = await syncAllSetsPrices({
//       dryRun: false,
//       verbose: false,
//     });

//     await disconnectPrisma();

//     console.log("✅ CRON: Finished", result);

//     return NextResponse.json({
//       success: true,
//       ...result,
//     });
//   } catch (error: any) {
//     console.error("❌ CRON ERROR:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

import { NextResponse } from "next/server";
import { syncAllSetsPrices, disconnectPrisma } from "@/../scripts/sync_cardmarket_prices_core";

export async function GET(req: Request) {
  try {
    // 🔐 Vérification sécurité Vercel Cron
    const authHeader = req.headers.get("authorization");
    const vercelCronHeader = req.headers.get("x-vercel-cron-secret"); // ✅ fallback
    const secret = process.env.CRON_SECRET;

    const bearerOk = authHeader === `Bearer ${secret}`;
    const vercelOk = vercelCronHeader === secret;

    if (!bearerOk && !vercelOk) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("⏰ CRON: Starting daily price sync...");

    const result = await syncAllSetsPrices({
      dryRun: false,
      verbose: false,
    });

    await disconnectPrisma();

    console.log("✅ CRON: Finished", result);

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