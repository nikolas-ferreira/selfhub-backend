import prismaClient from "../prisma";
import bcrypt from "bcryptjs";
import { successResponse } from "../utils/httpResponse";

interface RegisterUserProps {
  name: string;
  lastname: string;
  email: string;
  password: string;
  restaurantId: string;
  role?: "WAITER" | "ADMIN" | "MANAGER";
}

export class RegisterUserService {
  async execute({ name, lastname, email, password, restaurantId, role = "WAITER" }: RegisterUserProps) {
    const userExists = await prismaClient.profile.findUnique({
      where: { email }
    });

    if (userExists) {
      throw { statusCode: 409, message: "Email is already in use" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prismaClient.profile.create({
      data: {
        name,
        lastname,
        email,
        password: hashedPassword,
        restaurantId,
        role
      }
    });

    return successResponse(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
      },
      "User registered successfully" 
    );
  }
}