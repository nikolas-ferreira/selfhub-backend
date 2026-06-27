import prisma from "../../shared/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../shared/utils/httpResponse";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_MANAGE_DISCOUNT: Role[] = ["MANAGER", "ADMIN"];

export const formatCustomerDiscount = (discount: {
  id: string;
  restaurantId: string;
  customerId: string;
  discountPercent: number | null;
  discountAmount: number | null;
  reason: string | null;
  status: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  usedAt: Date | null;
  usedOrderId: string | null;
  canceledAt: Date | null;
}) => ({
  id: discount.id,
  restaurantId: discount.restaurantId,
  customerId: discount.customerId,
  discountPercent: discount.discountPercent,
  discountAmount: discount.discountAmount,
  reason: discount.reason,
  status: discount.status,
  createdById: discount.createdById,
  createdByName: discount.createdByName,
  createdAt: discount.createdAt,
  usedAt: discount.usedAt,
  usedOrderId: discount.usedOrderId,
  canceledAt: discount.canceledAt,
});

/**
 * Manual "discount for this customer's next order" grants — e.g. a manager rewarding a frequent
 * customer. See `Order.customerDiscountId`/`CreateOrderService` for how it gets claimed and applied.
 */
export class CustomerDiscountService {
  /** `POST /customers/:customerId/discounts` — only one ACTIVE discount per customer at a time. */
  async create({
    customerId,
    discountPercent,
    discountAmount,
    reason,
    loggedUser,
  }: {
    customerId: string;
    discountPercent?: number;
    discountAmount?: number;
    reason?: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_MANAGE_DISCOUNT.includes(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can grant a customer discount");
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId: loggedUser.restaurantId },
    });
    if (!customer) {
      return notFound("Customer not found");
    }

    if (discountPercent == null && discountAmount == null) {
      return badRequest("Provide 'discountPercent' or 'discountAmount'");
    }

    if (discountPercent != null && discountAmount != null) {
      return badRequest("Provide only one of 'discountPercent' or 'discountAmount'");
    }

    if (discountPercent != null && (typeof discountPercent !== "number" || discountPercent <= 0 || discountPercent > 100)) {
      return badRequest("'discountPercent' must be a number between 0 and 100");
    }

    if (discountAmount != null && (typeof discountAmount !== "number" || discountAmount <= 0)) {
      return badRequest("'discountAmount' must be a positive number");
    }

    const existingActive = await prisma.customerDiscount.findFirst({
      where: { customerId, restaurantId: loggedUser.restaurantId, status: "ACTIVE" },
    });
    if (existingActive) {
      return conflict("This customer already has an active discount — cancel it before granting a new one");
    }

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const created = await prisma.customerDiscount.create({
      data: {
        restaurantId: loggedUser.restaurantId,
        customerId,
        discountPercent: discountPercent ?? null,
        discountAmount: discountAmount ?? null,
        reason: reason?.trim() || null,
        createdById: loggedUser.id,
        createdByName: creator?.name ?? "",
      },
    });

    return { statusCode: 201, response: formatCustomerDiscount(created), message: "Discount granted successfully" };
  }

  /** `POST /customer-discounts/:id/cancel` */
  async cancel({ id, loggedUser }: { id: string; loggedUser: LoggedUser }) {
    if (!CAN_MANAGE_DISCOUNT.includes(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can cancel a customer discount");
    }

    const discount = await prisma.customerDiscount.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    });
    if (!discount) {
      return notFound("Discount not found");
    }

    if (discount.status !== "ACTIVE") {
      return badRequest(`Discount is already ${discount.status}`);
    }

    const updated = await prisma.customerDiscount.update({
      where: { id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });

    return { statusCode: 200, response: formatCustomerDiscount(updated), message: "Discount canceled successfully" };
  }
}
