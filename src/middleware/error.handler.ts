import { NextFunction, Request, Response } from "express";
import { ApiError, fail } from "../utils/apiResponse";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message);
  }
  console.error("[Unhandled Error]", err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

export function notFoundHandler(_req: Request, res: Response) {
  return fail(res, 404, "ROUTE_NOT_FOUND", "This route does not exist.");
}
