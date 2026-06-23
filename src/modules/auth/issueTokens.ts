import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import prismaClient from "../../shared/prisma";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./tokenConfig";

export interface ProfileClaims {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** SHA-256 hex digest. Refresh tokens are only ever persisted in this hashed form. */
export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Signs a short-lived access token carrying `{ id, role, restaurantId }`, verified by {@link import("../../shared/utils/verifyToken").verifyToken}. */
export function signAccessToken(profile: ProfileClaims) {
  return jwt.sign(
    { id: profile.id, role: profile.role, restaurantId: profile.restaurantId },
    process.env.JWT_SECRET as string,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );
}

/** Generates a new opaque refresh token and persists its hash, scoped to `profileId`. */
export async function issueRefreshToken(profileId: string) {
  const token = randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prismaClient.refreshToken.create({
    // `revokedAt` must be written explicitly as `null`, not omitted: on this
    // Mongo connector, an omitted optional field is stored as genuinely
    // absent, and `where: { revokedAt: null }` (used everywhere we query for
    // "still active" tokens) does NOT match an absent field, only an
    // explicit null value. Omitting it here would silently make every
    // "revoke all active tokens" query (reuse-detection cascade, password
    // change) match zero rows for tokens created this way.
    data: { tokenHash: hashRefreshToken(token), profileId, expiresAt, revokedAt: null },
  });

  return token;
}

/**
 * Issues a fresh access token + refresh token pair for a profile, along with
 * their TTLs in seconds — the shape both {@link LoginUserService} and
 * {@link RefreshTokenService} return to the client.
 */
export async function issueTokenPair(profile: ProfileClaims) {
  const [token, refreshToken] = await Promise.all([
    signAccessToken(profile),
    issueRefreshToken(profile.id),
  ]);

  return {
    token,
    tokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  };
}
