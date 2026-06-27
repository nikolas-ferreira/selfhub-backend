import prisma from "../../shared/prisma";
import { badRequest, forbidden, notFound } from "../../shared/utils/httpResponse";
import { HomeSectionInput, HomeSectionDisplayStyle } from "./homeSectionsTypes";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

interface SaveHomeSectionsInput {
  restaurantId: string;
  sections: HomeSectionInput[];
  loggedUser: LoggedUser;
}

const SECTION_TYPES = ["BANNER_CAROUSEL", "PRODUCT_CAROUSEL"];
const DISPLAY_STYLES: HomeSectionDisplayStyle[] = ["CARD", "CIRCLE", "FEATURED"];
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/** Ordered marketing/menu sections shown at the top of the digital menu home page — see schema.prisma `HomeSection`. */
export class HomeSectionsService {
  private hasPermission(role: LoggedUser["role"]) {
    return role === "ADMIN" || role === "MANAGER";
  }

  async get(restaurantId: string, loggedUser: LoggedUser) {
    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      return notFound("Restaurant not found");
    }

    return { statusCode: 200, response: restaurant.homeSections };
  }

  async save({ restaurantId, sections, loggedUser }: SaveHomeSectionsInput) {
    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    if (!this.hasPermission(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can manage the digital menu's home sections");
    }

    if (!Array.isArray(sections)) {
      return badRequest("'sections' must be an array");
    }

    const validationError = this.validateSections(sections);
    if (validationError) {
      return badRequest(validationError);
    }

    const productIds = new Set<string>();
    const categoryIds = new Set<string>();

    for (const section of sections) {
      for (const item of section.items ?? []) {
        productIds.add(item.productId);
      }
      for (const banner of section.banners ?? []) {
        if (banner.ctaProductId) productIds.add(banner.ctaProductId);
        if (banner.ctaCategoryId) categoryIds.add(banner.ctaCategoryId);
      }
    }

    if (productIds.size > 0) {
      const found = await prisma.product.findMany({
        where: { id: { in: [...productIds] }, category: { restaurantId } },
        select: { id: true },
      });
      if (found.length !== productIds.size) {
        return badRequest("One or more referenced products don't exist in this restaurant's catalog");
      }
    }

    if (categoryIds.size > 0) {
      const found = await prisma.category.findMany({
        where: { id: { in: [...categoryIds] }, restaurantId },
        select: { id: true },
      });
      if (found.length !== categoryIds.size) {
        return badRequest("One or more referenced categories don't exist in this restaurant");
      }
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        homeSections: sections.map((section) => ({
          id: section.id,
          type: section.type,
          title: section.title ?? null,
          displayStyle: section.type === "PRODUCT_CAROUSEL" ? section.displayStyle ?? "CARD" : null,
          isActive: section.isActive,
          banners: section.type === "BANNER_CAROUSEL" ? section.banners ?? [] : [],
          items: section.type === "PRODUCT_CAROUSEL" ? section.items ?? [] : [],
        })),
      },
    });

    return { statusCode: 200, response: restaurant.homeSections, message: "Home sections saved successfully" };
  }

  /** Returns an error message, or `null` if everything is valid. */
  private validateSections(sections: HomeSectionInput[]): string | null {
    const sectionIds = new Set<string>();

    for (const section of sections) {
      if (!section.id || typeof section.id !== "string") {
        return "Each section requires a non-empty 'id'";
      }
      if (sectionIds.has(section.id)) {
        return `Duplicate section id '${section.id}'`;
      }
      sectionIds.add(section.id);

      if (!SECTION_TYPES.includes(section.type)) {
        return `Each section's 'type' must be one of: ${SECTION_TYPES.join(", ")}`;
      }

      if (typeof section.isActive !== "boolean") {
        return "Each section's 'isActive' must be a boolean";
      }

      if (section.type === "PRODUCT_CAROUSEL") {
        if (section.displayStyle && !DISPLAY_STYLES.includes(section.displayStyle)) {
          return `'displayStyle' must be one of: ${DISPLAY_STYLES.join(", ")}`;
        }

        const items = section.items ?? [];
        if (items.length === 0) {
          return `Section '${section.id}' (PRODUCT_CAROUSEL) needs at least one item`;
        }

        const itemIds = new Set<string>();
        for (const item of items) {
          if (!item.id || itemIds.has(item.id)) {
            return `Each item in section '${section.id}' needs a unique, non-empty 'id'`;
          }
          itemIds.add(item.id);

          if (!item.productId || !OBJECT_ID_REGEX.test(item.productId)) {
            return `Each item in section '${section.id}' needs a valid 'productId'`;
          }
        }
      }

      if (section.type === "BANNER_CAROUSEL") {
        const banners = section.banners ?? [];
        if (banners.length === 0) {
          return `Section '${section.id}' (BANNER_CAROUSEL) needs at least one banner`;
        }

        const bannerIds = new Set<string>();
        for (const banner of banners) {
          if (!banner.id || bannerIds.has(banner.id)) {
            return `Each banner in section '${section.id}' needs a unique, non-empty 'id'`;
          }
          bannerIds.add(banner.id);

          if (!banner.imageUrl?.trim()) {
            return `Each banner in section '${section.id}' needs an 'imageUrl'`;
          }

          if (banner.ctaProductId && !OBJECT_ID_REGEX.test(banner.ctaProductId)) {
            return `Banner '${banner.id}' has an invalid 'ctaProductId'`;
          }
          if (banner.ctaCategoryId && !OBJECT_ID_REGEX.test(banner.ctaCategoryId)) {
            return `Banner '${banner.id}' has an invalid 'ctaCategoryId'`;
          }
          if (banner.ctaProductId && banner.ctaCategoryId) {
            return `Banner '${banner.id}' can't have both 'ctaProductId' and 'ctaCategoryId'`;
          }
        }
      }
    }

    return null;
  }
}
