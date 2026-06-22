import prismaClient from "../../shared/prisma";
import { unauthorized } from "../../shared/utils/httpResponse";

interface CreateCategoryRequest {
  name: string;
  iconUrl: string;
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

/** Creates menu categories scoped to the caller's restaurant. */
export class CreateCategoryService {
  /** Rejects WAITER; otherwise creates the category under `loggedUser.restaurantId`. */
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
