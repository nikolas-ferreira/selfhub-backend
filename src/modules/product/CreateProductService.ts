import prisma from "../../shared/prisma";
import { unauthorized, notFound } from "../../shared/utils/httpResponse";

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
  customizationGroups?: CustomizationGroupInput[];
}

/** Creates products (with optional nested customization groups/options) for a category. */
export class CreateProductService {
  /**
   * Rejects WAITER; 404s if `categoryId` doesn't exist or belongs to another
   * restaurant. `customizationGroups`, when provided, are created in the same
   * nested write as the product (atomic — single Prisma `create`).
   */
  async execute({
    name,
    price,
    imageUrl,
    description,
    categoryId,
    loggedUser,
    customizationGroups,
  }: CreateProductRequest) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can create products");
    }

    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        restaurantId: loggedUser.restaurantId,
      },
    });

    if (!category) {
      return notFound("Category not found or doesn't belong to your restaurant");
    }

    const product = await prisma.product.create({
      data: {
        name,
        price,
        imageUrl,
        description,
        categoryId,
        createdById: loggedUser.id,
        lastEditedById: loggedUser.id,
        customizationGroups: {
          create: customizationGroups?.map(group => ({
            name: group.name,
            min: group.min,
            max: group.max,
            options: {
              create: group.options.map(option => ({
                name: option.name,
                price: option.price,
              })),
            },
          })) || [],
        },
      },
      include: {
        customizationGroups: {
          include: {
            options: true,
          },
        },
      },
    });

    return {
      statusCode: 201,
      response: product,
      message: "Product created successfully",
    };
  }
}
