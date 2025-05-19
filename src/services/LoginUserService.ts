import prismaClient from "../prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { successResponse } from "../utils/httpResponse";

interface LoginUserProps {
  email: string;
  password: string;
}

export class LoginUserService {
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