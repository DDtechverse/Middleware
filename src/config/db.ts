import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance across the app
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
