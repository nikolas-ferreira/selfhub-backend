import prismaClient from "../../shared/prisma";
import { notFound, unauthorized } from "../../shared/utils/httpResponse";

interface EditCategoryRequest {
  id: string;
  name?: string;
  iconUrl?: string;
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

export class EditCategoryService {
  async execute({ id, name, iconUrl, loggedUser }: EditCategoryRequest) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can edit categories");
    }

    const category = await prismaClient.category.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    });

    if (!category) {
      return notFound("Category not found or doesn't belong to your restaurant");
    }

    const updated = await prismaClient.category.update({
      where: { id },
      data: {
        name,
        iconUrl,
        lastEditedById: loggedUser.id,
      },
    });

    return {
      statusCode: 200,
      response: updated,
      message: "Category updated successfully",
    };
  }
}
