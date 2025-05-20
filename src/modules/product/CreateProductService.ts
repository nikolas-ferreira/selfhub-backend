import prismaClient from "../../shared/prisma";
import { unauthorized, notFound } from "../../shared/utils/httpResponse";

interface CreateProductRequest {
  name: string;
  price: number;
  imageUrl: string;
  description: string;
  categoryId: string;
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

export class CreateProductService {
  async execute({
    name,
    price,
    imageUrl,
    description,
    categoryId,
    loggedUser,
  }: CreateProductRequest) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can create products");
    }

    // Verificar se a categoria existe e pertence ao restaurante do usuário
    const category = await prismaClient.category.findFirst({
      where: {
        id: categoryId,
        restaurantId: loggedUser.restaurantId,
      },
    });

    if (!category) {
      return notFound("Category not found or doesn't belong to your restaurant");
    }

    const product = await prismaClient.product.create({
      data: {
        name,
        price,
        imageUrl,
        description,
        categoryId,
        createdById: loggedUser.id,
        lastEditedById: loggedUser.id,
      },
    });

    return {
      statusCode: 201,
      response: product,
      message: "Product created successfully",
    };
  }
}
