import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  adapter: process.env.DATABASE_URL, // ou accelerateUrl si tu veux Prisma Accelerate
});
