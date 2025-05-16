import prismaClient from "../prisma";
import { unauthorized } from "../utils/httpResponse";

interface CreateCategoryRequest {
  name: string;
  iconUrl: string;
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

export class CreateCategoryService {
  async execute({ name, iconUrl, loggedUser }: CreateCategoryRequest) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can create categories");
    }

    const category = await prismaClient.category.create({
      data: {
        name,
        iconUrl,
        restaurantId: loggedUser.restaurantId,
        lastEditedById: loggedUser.id,
      },
    });

    return {
      statusCode: 201,
      response: category,
      message: "Category created successfully",
    };
  }
}
