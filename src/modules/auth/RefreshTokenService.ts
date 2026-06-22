import prismaClient from "../../shared/prisma";
import { successResponse } from "../../shared/utils/httpResponse";
import { hashRefreshToken, issueTokenPair } from "./issueTokens";

interface RefreshTokenProps {
  refreshToken: string;
}

/**
 * Exchanges a still-valid refresh token for a new access/refresh token pair.
 *
 * Implements rotation with reuse detection (OWASP-recommended): every
 * successful refresh revokes the token that was presented and issues a new
 * one. If a token that was already revoked is presented again — which only
 * happens if a refresh token leaked and was used by two different parties —
 * every active token for that profile is revoked, forcing a fresh login
 * everywhere.
 */
export class RefreshTokenService {
  /**
   * @throws {{statusCode: 400}} if `refreshToken` is missing.
   * @throws {{statusCode: 401}} if the token is unknown, expired, already
   * used (reuse detected), or its owning profile no longer exists.
   */
  async execute({ refreshToken }: RefreshTokenProps) {
    if (!refreshToken || typeof refreshToken !== "string") {
      throw { statusCode: 400, message: "refreshToken is required" };
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw { statusCode: 401, message: "Invalid refresh token" };
    }

    if (stored.revokedAt) {
      await prismaClient.refreshToken.updateMany({
        where: { profileId: stored.profileId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw { statusCode: 401, message: "Refresh token already used" };
    }

    if (stored.expiresAt < new Date()) {
      throw { statusCode: 401, message: "Refresh token expired" };
    }

    const profile = await prismaClient.profile.findUnique({ where: { id: stored.profileId } });
    if (!profile) {
      throw { statusCode: 401, message: "Invalid refresh token" };
    }

    const tokens = await issueTokenPair({
      id: profile.id,
      role: profile.role,
      restaurantId: profile.restaurantId,
    });

    await prismaClient.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByHash: hashRefreshToken(tokens.refreshToken),
      },
    });

    return successResponse(
      {
        ...tokens,
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          restaurantId: profile.restaurantId,
        },
      },
      "Token refreshed successfully"
    );
  }
}
