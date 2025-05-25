import prismaClient from "../../shared/prisma";
import { notFound, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

interface CustomizationOptionInput {
  name: string;
  price: number;
}

interface CustomizationGroupInput {
  name: string;
  min: number;
  max: number;
  options: CustomizationOptionInput[];
}

interface EditProductRequest {
  id: string;
  name?: string;
  price?: number;
  imageUrl?: string;
  description?: string;
  categoryId?: string;
  customizationGroups?: CustomizationGroupInput[];
  loggedUser: LoggedUser;
}

export class EditProductService {
  async execute({
    id,
    name,
    price,
    imageUrl,
    description,
    categoryId,
    customizationGroups,
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

    // Atualiza o produto básico
    const updatedProduct = await prismaClient.product.update({
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

    // Atualiza grupos e opções de customização se enviados
    if (customizationGroups) {
      // Pega grupos atuais para deletar antes de recriar
      const existingGroups = await prismaClient.customizationGroup.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const existingGroupIds = existingGroups.map(g => g.id);

      // Deleta todas as opções vinculadas aos grupos antigos
      await prismaClient.customizationOption.deleteMany({
        where: { customizationGroupId: { in: existingGroupIds } },
      });

      // Deleta os grupos antigos
      await prismaClient.customizationGroup.deleteMany({
        where: { productId: id },
      });

      // Cria novos grupos e opções
      for (const group of customizationGroups) {
        const createdGroup = await prismaClient.customizationGroup.create({
          data: {
            name: group.name,
            productId: id,
            min: group.min,
            max: group.max,
          },
        });

        for (const option of group.options) {
          await prismaClient.customizationOption.create({
            data: {
              name: option.name,
              price: option.price,
              customizationGroupId: createdGroup.id,
            },
          });
        }
      }
    }

    return {
      statusCode: 200,
      response: updatedProduct,
      message: "Product updated successfully",
    };
  }
}
