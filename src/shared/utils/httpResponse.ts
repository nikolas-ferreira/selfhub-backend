/**
 * Standard response envelope used across the API:
 * `{ statusCode, response, message }` for both success and error bodies.
 * All controllers should return through these helpers instead of building
 * the envelope by hand, to keep response shapes consistent.
 */

/** Wraps a successful payload in the standard envelope (HTTP 200). */
export const successResponse = (response: any, message?: string) => ({
  statusCode: 200,
  response,
  message: message || "Success",
});

/** Builds an error envelope with `response: null` for the given status code. */
export const errorResponse = (statusCode: number, message: string) => ({
  statusCode,
  response: null,
  message,
});

/** 401 — missing/invalid auth, or the caller lacks permission for the action. */
export const unauthorized = (message = "Unauthorized") =>
  errorResponse(401, message);

/** 404 — resource doesn't exist, or doesn't belong to the caller's restaurant. */
export const notFound = (message = "Not Found") =>
  errorResponse(404, message);

/**
 * 500 — unexpected failure. `message` must never contain raw internal detail
 * (no `error.message`, no stack). Pass `errorId` (use `request.id`) so the
 * client can report it and an operator can find the matching log line —
 * see {@link import("../middlewares/errorHandler").errorHandler} for the
 * logging side of this correlation.
 */
export const internalError = (message = "Internal Server Error", errorId?: string) => ({
  ...errorResponse(500, message),
  ...(errorId ? { errorId } : {}),
});

/** 400 — malformed or invalid input. */
export const badRequest = (message = "Bad Request") =>
  errorResponse(400, message);
