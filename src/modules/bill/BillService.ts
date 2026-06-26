import prisma from "../../shared/prisma";
import { OrderStatus } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../../shared/utils/httpResponse";
import { formatPayment } from "../payment/PaymentService";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_OPERATE_BILL: Role[] = ["CASHIER", "MANAGER", "ADMIN"];
const APPROVER_ROLES: Role[] = ["MANAGER", "ADMIN"];
/** Orders aggregated into a table's Bill: everything except FINISHED/CANCELED (see spec). */
const AGGREGATABLE_ORDER_STATUSES: OrderStatus[] = ["CREATED", "PREPARING", "COMING", "DELIVERED"];
/** Discounts up to this percentage are free for the cashier to apply; above it requires PIN approval. */
const FREE_DISCOUNT_THRESHOLD_PERCENT = 10;

const round2 = (value: number) => Math.round(value * 100) / 100;

export const formatBill = (
  bill: {
    id: string;
    restaurantId: string;
    /** Absent on Bills created before the comanda migration — see schema.prisma's doc comment. */
    comandaId: string | null;
    comandaNumber: number | null;
    tableNumber: number;
    cashSessionId: string;
    orderIds: string[];
    items: { productId: string; productName: string; quantity: number; unitPrice: number; total: number }[];
    subtotal: number;
    discountAmount: number;
    discountPercent: number | null;
    discountApprovedById: string | null;
    serviceFeeAmount: number;
    serviceFeePercent: number | null;
    total: number;
    status: string;
    closedAt: Date | null;
  },
  payments: Parameters<typeof formatPayment>[0][]
) => ({
  id: bill.id,
  restaurantId: bill.restaurantId,
  comandaId: bill.comandaId,
  comandaNumber: bill.comandaNumber,
  tableNumber: bill.tableNumber,
  cashSessionId: bill.cashSessionId,
  orderIds: bill.orderIds,
  items: bill.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
  })),
  subtotal: bill.subtotal,
  discountAmount: bill.discountAmount,
  discountPercent: bill.discountPercent,
  discountApprovedById: bill.discountApprovedById,
  serviceFeeAmount: bill.serviceFeeAmount,
  serviceFeePercent: bill.serviceFeePercent,
  total: bill.total,
  payments: payments.map(formatPayment),
  status: bill.status,
  closedAt: bill.closedAt,
});

/**
 * Aggregates `Order`s into a table's `Bill` and drives it through
 * discount/service-fee/close — see caixa-backend-spec.md §"Conta da mesa".
 */
export class BillService {
  /**
   * `GET /restaurants/:restaurantId/comandas/:comandaNumber/bill` — get-or-create.
   * Re-aggregates on every call so newly placed orders for the same comanda
   * show up without the cashier needing to do anything. Aggregates by
   * `comandaId`, not by table — a table can have several open comandas at
   * once, each with its own bill (see comandas-backend-spec.md).
   */
  async getOrCreateBill({
    restaurantId,
    comandaNumber,
    loggedUser,
  }: {
    restaurantId: string;
    comandaNumber: number;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_OPERATE_BILL.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can access the Caixa");
    }

    const session = await prisma.cashSession.findFirst({
      where: { cashierId: loggedUser.id, restaurantId, status: "OPEN" },
    });

    if (!session) {
      return badRequest("You need an open cash session to access a comanda's bill");
    }

    const comanda = await prisma.comanda.findFirst({
      where: { restaurantId, number: comandaNumber, status: "OPEN" },
    });

    if (!comanda) {
      return notFound("No open comanda with this number");
    }

    let bill = await prisma.bill.findFirst({ where: { restaurantId, comandaId: comanda.id, status: "OPEN" } });

    // Only orders that don't yet belong to any bill (new ones), or that already
    // belong to this same open bill (re-aggregation), are eligible — see
    // Order.billId's doc comment. Matched by comandaId, not table/origin.
    //
    // Fallback: LOCAL orders placed before the comanda migration (or by a
    // client that predates it) have comandaId: null — see Order.comandaId's
    // doc comment. Without this they'd keep a table "occupied" forever while
    // never showing up in any comanda's bill. Matched by table instead, and
    // only while unbilled, so each legacy order still gets claimed by just
    // one bill.
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: AGGREGATABLE_ORDER_STATUSES },
        OR: [
          { comandaId: comanda.id, billId: null },
          ...(bill ? [{ comandaId: comanda.id, billId: bill.id }] : []),
          { comandaId: null, origin: "LOCAL" as const, tableNumber: String(comanda.tableNumber), billId: null },
        ],
      },
      include: { items: { include: { product: true, customizations: true } } },
    });

    const debugByComandaOnly = await prisma.order.findMany({ where: { comandaId: comanda.id } });
    console.log("[BillService] getOrCreateBill debug", {
      restaurantId,
      comandaId: comanda.id,
      comandaTableNumber: comanda.tableNumber,
      existingBillId: bill?.id ?? null,
      ordersFound: orders.length,
      orderSample: orders.map((o) => ({ id: o.id, comandaId: o.comandaId, status: o.status, billId: o.billId, tableNumber: o.tableNumber })),
      byComandaOnlyCount: debugByComandaOnly.length,
      byComandaOnlySample: debugByComandaOnly.map((o) => ({ id: o.id, comandaId: o.comandaId, status: o.status, billId: o.billId, restaurantId: o.restaurantId })),
    });

    const itemsByProduct = new Map<string, { productId: string; productName: string; quantity: number; total: number }>();
    for (const order of orders) {
      for (const orderItem of order.items) {
        const customizationsTotal = orderItem.customizations.reduce(
          (sum, opt) => sum + opt.additionalPrice * opt.quantity,
          0
        );
        const lineTotal = (orderItem.product.price + customizationsTotal) * orderItem.quantity;

        const existing = itemsByProduct.get(orderItem.productId);
        if (existing) {
          existing.quantity += orderItem.quantity;
          existing.total += lineTotal;
        } else {
          itemsByProduct.set(orderItem.productId, {
            productId: orderItem.productId,
            productName: orderItem.product.name,
            quantity: orderItem.quantity,
            total: lineTotal,
          });
        }
      }
    }

    const items = [...itemsByProduct.values()].map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.quantity > 0 ? round2(item.total / item.quantity) : 0,
      total: round2(item.total),
    }));
    const subtotal = round2(items.reduce((sum, item) => sum + item.total, 0));
    const orderIds = orders.map((order) => order.id);

    // Discount/service-fee already set on the bill are preserved across
    // re-aggregation; only their derived *amount* is recomputed against the
    // new subtotal (a fixed discountAmount, with no percent on file, is kept as-is).
    const discountPercent = bill?.discountPercent ?? null;
    const discountAmount = discountPercent != null ? round2((subtotal * discountPercent) / 100) : bill?.discountAmount ?? 0;
    const serviceFeePercent = bill?.serviceFeePercent ?? null;
    const serviceFeeAmount = serviceFeePercent != null ? round2(((subtotal - discountAmount) * serviceFeePercent) / 100) : 0;
    const total = round2(subtotal - discountAmount + serviceFeeAmount);

    if (bill) {
      const mergedOrderIds = Array.from(new Set([...bill.orderIds, ...orderIds]));
      bill = await prisma.$transaction(async (tx) => {
        if (orderIds.length) {
          await tx.order.updateMany({ where: { id: { in: orderIds }, billId: null }, data: { billId: bill!.id } });
        }
        return tx.bill.update({
          where: { id: bill!.id },
          data: { orderIds: mergedOrderIds, items, subtotal, discountAmount, serviceFeeAmount, total },
        });
      });
    } else {
      bill = await prisma.$transaction(async (tx) => {
        const created = await tx.bill.create({
          data: {
            restaurantId,
            comandaId: comanda.id,
            comandaNumber: comanda.number,
            tableNumber: comanda.tableNumber,
            cashSessionId: session.id,
            orderIds,
            items,
            subtotal,
            discountAmount: 0,
            serviceFeeAmount: 0,
            total: subtotal,
          },
        });
        if (orderIds.length) {
          await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { billId: created.id } });
        }
        return created;
      });
    }

    const payments = await prisma.payment.findMany({ where: { billId: bill.id }, orderBy: { createdAt: "asc" } });
    return { statusCode: 200, response: formatBill(bill, payments) };
  }

  /** `PATCH /bills/:id/discount` — over-10% discounts require a valid PIN-verified `approverId`. */
  async updateDiscount({
    billId,
    discountPercent,
    discountAmount,
    approverId,
    loggedUser,
  }: {
    billId: string;
    discountPercent?: number;
    discountAmount?: number;
    approverId?: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_OPERATE_BILL.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can apply a discount");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot edit the discount on a ${bill.status} bill`);
    }

    if (discountPercent == null && discountAmount == null) {
      return badRequest("Provide 'discountPercent' or 'discountAmount'");
    }

    if (discountPercent != null && (typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100)) {
      return badRequest("'discountPercent' must be a number between 0 and 100");
    }

    if (discountAmount != null && (typeof discountAmount !== "number" || discountAmount < 0)) {
      return badRequest("'discountAmount' must be a non-negative number");
    }

    const resolvedAmount = discountPercent != null ? round2((bill.subtotal * discountPercent) / 100) : round2(discountAmount!);
    const resolvedPercent = bill.subtotal > 0 ? (resolvedAmount / bill.subtotal) * 100 : 0;

    if (resolvedAmount > bill.subtotal) {
      return badRequest("Discount cannot exceed the bill subtotal");
    }

    let discountApprovedById: string | null = null;
    if (resolvedPercent > FREE_DISCOUNT_THRESHOLD_PERCENT) {
      if (!approverId) {
        return badRequest(`'approverId' is required for discounts above ${FREE_DISCOUNT_THRESHOLD_PERCENT}%`);
      }

      const approver = await prisma.profile.findFirst({
        where: { id: approverId, restaurantId: loggedUser.restaurantId, isActive: true, role: { in: APPROVER_ROLES } },
      });

      if (!approver) {
        return forbidden("Invalid discount approver");
      }

      discountApprovedById = approver.id;
    }

    const serviceFeeAmount =
      bill.serviceFeePercent != null ? round2(((bill.subtotal - resolvedAmount) * bill.serviceFeePercent) / 100) : bill.serviceFeeAmount;
    const total = round2(bill.subtotal - resolvedAmount + serviceFeeAmount);

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: {
        discountPercent: discountPercent != null ? discountPercent : null,
        discountAmount: resolvedAmount,
        discountApprovedById,
        serviceFeeAmount,
        total,
      },
    });

    const payments = await prisma.payment.findMany({ where: { billId }, orderBy: { createdAt: "asc" } });
    return { statusCode: 200, response: formatBill(updated, payments), message: "Discount applied successfully" };
  }

  /** `PATCH /bills/:id/service-fee` — `serviceFeePercent: null` removes the fee. */
  async updateServiceFee({
    billId,
    serviceFeePercent,
    loggedUser,
  }: {
    billId: string;
    serviceFeePercent: number | null;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_OPERATE_BILL.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can edit the service fee");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot edit the service fee on a ${bill.status} bill`);
    }

    if (serviceFeePercent !== null && (typeof serviceFeePercent !== "number" || serviceFeePercent < 0)) {
      return badRequest("'serviceFeePercent' must be a non-negative number or null");
    }

    const serviceFeeAmount =
      serviceFeePercent != null ? round2(((bill.subtotal - bill.discountAmount) * serviceFeePercent) / 100) : 0;
    const total = round2(bill.subtotal - bill.discountAmount + serviceFeeAmount);

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: { serviceFeePercent, serviceFeeAmount, total },
    });

    const payments = await prisma.payment.findMany({ where: { billId }, orderBy: { createdAt: "asc" } });
    return { statusCode: 200, response: formatBill(updated, payments), message: "Service fee updated successfully" };
  }

  /**
   * `POST /bills/:id/close` — only when `sum(payments.CONFIRMED) >= total`.
   * Finishes every aggregated order and closes the comanda. Does **not**
   * touch the table's status: another comanda from the same table may still
   * be open, so freeing the table is the front's job (it checks
   * `GET /tables/:tableNumber/comandas?status=OPEN` first) — see
   * comandas-backend-spec.md.
   */
  async closeBill({ billId, loggedUser }: { billId: string; loggedUser: LoggedUser }) {
    if (!CAN_OPERATE_BILL.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can close a bill");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Bill is already ${bill.status}`);
    }

    const payments = await prisma.payment.findMany({ where: { billId } });
    const confirmedTotal = round2(payments.filter((p) => p.status === "CONFIRMED").reduce((sum, p) => sum + p.amount, 0));

    if (confirmedTotal < bill.total) {
      return badRequest("Bill is not fully paid yet");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const closed = await tx.bill.update({ where: { id: billId }, data: { status: "PAID", closedAt: new Date() } });

      if (bill.orderIds.length) {
        await tx.order.updateMany({ where: { id: { in: bill.orderIds } }, data: { status: "FINISHED", finishedAt: new Date() } });
      }

      // Absent on a handful of Bills predating the comanda migration — see schema.prisma's doc comment.
      if (bill.comandaId) {
        await tx.comanda.update({ where: { id: bill.comandaId }, data: { status: "CLOSED", closedAt: new Date() } });
      }

      return closed;
    });

    return { statusCode: 200, response: formatBill(updated, payments), message: "Bill closed successfully" };
  }
}
