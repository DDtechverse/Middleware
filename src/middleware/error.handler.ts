import { NextFunction, Request, Response } from "express";
import { ApiError, fail } from "../utils/apiResponse";
import { Prisma } from "@prisma/client";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message);
  }

  // Safety net: any Prisma unique-constraint violation (P2002) that wasn't
  // caught with a specific, friendly message beforehand still gets a real
  // explanation instead of a generic "Something went wrong" 500 — this is
  // what a duplicate email/phone/serialNumber etc. looks like if a
  // pre-check was missed somewhere.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const fields = (err.meta?.target as string[] | undefined)?.join(", ") || "value";
    return fail(res, 409, "DUPLICATE_VALUE", `This ${fields} is already in use.`);
  }

  console.error("[Unhandled Error]", err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

export function notFoundHandler(_req: Request, res: Response) {
  return fail(res, 404, "ROUTE_NOT_FOUND", "This route does not exist.");
}
