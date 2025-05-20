import prismaClient from "../prisma";
import { notFound, unauthorized } from "../utils/httpResponse";

interface EditProductRequest {
  id: string;
  name?: string;
  price?: number;
  imageUrl?: string;
  description?: string;
  categoryId?: string;
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

export class EditProductService {
  async execute({
    id,
    name,
    price,
    imageUrl,
    description,
    categoryId,
    loggedUser,
  }: EditProductRequest) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can edit products");
    }

    const product = await prismaClient.product.findFirst({
      where: { id, category: { restaurantId: loggedUser.restaurantId } },
    });

    if (!product) {
      return notFound("Product not found or doesn't belong to your restaurant");
    }

    if (categoryId) {
      const category = await prismaClient.category.findFirst({
        where: {
          id: categoryId,
          restaurantId: loggedUser.restaurantId,
        },
      });

      if (!category) {
        return notFound("New category not found or doesn't belong to your restaurant");
      }
    }

    const updated = await prismaClient.product.update({
      where: { id },
      data: {
        name,
        price,
        imageUrl,
        description,
        categoryId,
        lastEditedById: loggedUser.id,
      },
    });

    return {
      statusCode: 200,
      response: updated,
      message: "Product updated successfully",
    };
  }
}
