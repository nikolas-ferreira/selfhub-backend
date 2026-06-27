import prisma from "../../shared/prisma";
import { badRequest, forbidden, notFound } from "../../shared/utils/httpResponse";
import { BusinessHoursDayInput } from "../../shared/utils/businessHours";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

interface SaveBusinessHoursInput {
  restaurantId: string;
  days: BusinessHoursDayInput[];
  loggedUser: LoggedUser;
}

const TIME_REGEX = /^\d{2}:\d{2}$/;

/** Weekly opening hours for the restaurant — always exactly 7 entries (Sunday..Saturday), not a dynamic list. */
export class BusinessHoursService {
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

    return { statusCode: 200, response: restaurant.businessHours };
  }

  async save({ restaurantId, days, loggedUser }: SaveBusinessHoursInput) {
    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    if (!this.hasPermission(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can manage business hours");
    }

    if (!Array.isArray(days) || days.length !== 7) {
      return badRequest("'days' must have exactly 7 entries (Sunday..Saturday)");
    }

    const seenDays = new Set<number>();

    for (const day of days) {
      if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
        return badRequest("Each entry's 'dayOfWeek' must be an integer between 0 and 6");
      }

      if (seenDays.has(day.dayOfWeek)) {
        return badRequest(`Duplicate 'dayOfWeek' ${day.dayOfWeek}`);
      }
      seenDays.add(day.dayOfWeek);

      if (typeof day.isOpen !== "boolean") {
        return badRequest("Each entry's 'isOpen' must be a boolean");
      }

      if (day.isOpen) {
        if (!day.openTime || !TIME_REGEX.test(day.openTime) || !day.closeTime || !TIME_REGEX.test(day.closeTime)) {
          return badRequest("Each open day requires 'openTime' and 'closeTime' in 'HH:mm' format");
        }
      }
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        businessHours: days.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isOpen: day.isOpen,
          openTime: day.isOpen ? day.openTime : null,
          closeTime: day.isOpen ? day.closeTime : null,
        })),
      },
    });

    return { statusCode: 200, response: restaurant.businessHours, message: "Business hours saved successfully" };
  }
}
