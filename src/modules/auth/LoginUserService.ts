import prismaClient from "../../shared/prisma";
import bcrypt from "bcryptjs";
import { successResponse } from "../../shared/utils/httpResponse";
import { issueTokenPair } from "./issueTokens";

interface LoginUserProps {
  email: string;
  password: string;
}

/** Authenticates a profile by email/password and issues an access/refresh token pair. */
export class LoginUserService {
  /**
   * Validates credentials and issues a short-lived access token (JWT, see
   * {@link issueTokenPair}) plus a long-lived refresh token that the client
   * exchanges via `POST /auth/refresh-token` once the access token expires.
   *
   * @throws {{statusCode: 404}} if no profile matches the email.
   * @throws {{statusCode: 401}} if the password does not match.
   */
  async execute({ email, password }: LoginUserProps) {
    const user = await prismaClient.profile.findUnique({ where: { email } });

    if (!user) {
      throw { statusCode: 404, message: "User not found" };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw { statusCode: 401, message: "Invalid password" };
    }

    const tokens = await issueTokenPair({
      id: user.id,
      role: user.role,
      restaurantId: user.restaurantId,
    });

    return successResponse(
      {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId
        },
      },
      "Login successful"
    );
  }
}
