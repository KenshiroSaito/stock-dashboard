/**
 * Shared error response helpers.
 *
 * The shape `{ error: { code, message } }` is part of our API contract.
 * Centralizing it here ensures all endpoints return errors in the same
 * format, and makes it easy to evolve the shape in one place if needed.
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Known error codes used across the API.
 * Keeping this as a union (not a free-form string) makes typos compile-time
 * errors and gives autocomplete in editors.
 */
export type ErrorCode =
  | "INVALID_PARAMETER"
  | "STOCK_NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

/**
 * Send a JSON error response with the agreed shape.
 * Always returns the Hono Response so the caller can `return` it directly.
 */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}
