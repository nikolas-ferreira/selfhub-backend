import prismaClient from "../../shared/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { successResponse } from "../../shared/utils/httpResponse";

interface LoginUserProps {
  email: string;
  password: string;
}

/** Authenticates a profile by email/password and issues a JWT. */
export class LoginUserService {
  /**
   * Validates credentials and signs a 1-day JWT containing `id`, `role` and
   * `restaurantId`, which is what {@link verifyToken} later decodes into
   * `request.user`.
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

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        restaurantId: user.restaurantId,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );


    return successResponse(
      {
        token,
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