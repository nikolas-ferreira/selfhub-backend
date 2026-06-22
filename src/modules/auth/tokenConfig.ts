/** Access token (JWT) lifetime, in seconds. Short-lived by design. */
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

/** Refresh token lifetime, in seconds. Long-lived; revocable since it's stored server-side. */
export const REFRESH_TOKEN_TTL_SECONDS = 6 * 60 * 60;
