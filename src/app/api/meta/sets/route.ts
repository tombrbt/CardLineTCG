import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sets = await prisma.set.findMany({
    orderBy: { releaseDate: "desc" },
    select: {
      code: true,
      name_fr: true,
    },
  });

  

  return NextResponse.json({
    success: true,
    sets,
  });
}