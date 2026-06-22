import prismaClient from "../../shared/prisma";
import bcrypt from "bcryptjs";
import { successResponse } from "../../shared/utils/httpResponse";

interface RegisterUserProps {
  name: string;
  lastname: string;
  email: string;
  password: string;
  restaurantId: string;
}

/**
 * Public self-service registration.
 *
 * Always creates the new profile with role `WAITER`, regardless of any
 * `role` field a caller might send — promotion to `MANAGER`/`ADMIN` must go
 * through an authenticated ADMIN via {@link UpdateProfileService}.
 */
export class RegisterUserService {
  /**
   * Creates a new WAITER profile under an existing restaurant.
   *
   * @throws {{statusCode: 400}} if `restaurantId` is not a valid ObjectId.
   * @throws {{statusCode: 404}} if the restaurant does not exist.
   * @throws {{statusCode: 409}} if the email is already registered.
   */
  async execute({ name, lastname, email, password, restaurantId }: RegisterUserProps) {
    if (!restaurantId || !/^[0-9a-fA-F]{24}$/.test(restaurantId)) {
      throw { statusCode: 400, message: "Invalid restaurantId" };
    }

    const restaurant = await prismaClient.restaurant.findUnique({
      where: { id: restaurantId }
    });

    if (!restaurant) {
      throw { statusCode: 404, message: "Restaurant not found" };
    }

    const userExists = await prismaClient.profile.findUnique({
      where: { email }
    });

    if (userExists) {
      throw { statusCode: 409, message: "Email is already in use" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Public registration always creates a WAITER. Promotion to MANAGER/ADMIN
    // must go through an authenticated ADMIN via PUT /profile/:id.
    const user = await prismaClient.profile.create({
      data: {
        name,
        lastname,
        email,
        password: hashedPassword,
        restaurantId,
        role: "WAITER"
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