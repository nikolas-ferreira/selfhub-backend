import prisma from "../../shared/prisma";
import { badRequest, forbidden, notFound, unauthorized } from "../../shared/utils/httpResponse";
import * as mercadoPago from "./mercadoPago";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_REGISTER_PAYMENT: Role[] = ["CASHIER", "MANAGER", "ADMIN"];
const MANUAL_METHODS = ["CASH", "CARD"] as const;
type ManualMethod = (typeof MANUAL_METHODS)[number];

export const formatPayment = (payment: {
  id: string;
  billId: string;
  method: string;
  amount: number;
  status: string;
  pixTxId: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixPaidAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}) => ({
  id: payment.id,
  billId: payment.billId,
  method: payment.method,
  amount: payment.amount,
  status: payment.status,
  pixTxId: payment.pixTxId,
  pixQrCode: payment.pixQrCode,
  pixCopyPaste: payment.pixCopyPaste,
  pixPaidAt: payment.pixPaidAt,
  createdAt: payment.createdAt,
  createdById: payment.createdById,
  createdByName: payment.createdByName,
});

/** Payment registration/lookup for a `Bill` — see caixa-backend-spec.md §"Pagamentos". */
export class PaymentService {
  /** `POST /bills/:id/payments` — CASH/CARD are confirmed manually, no TEF involved. */
  async registerPayment({
    billId,
    method,
    amount,
    loggedUser,
  }: {
    billId: string;
    method: ManualMethod;
    amount: number;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_REGISTER_PAYMENT.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can register payments");
    }

    if (!MANUAL_METHODS.includes(method)) {
      return badRequest("'method' must be CASH or CARD");
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return badRequest("'amount' must be a positive number");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot register a payment on a ${bill.status} bill`);
    }

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const payment = await prisma.payment.create({
      data: { billId, method, amount, status: "CONFIRMED", createdById: loggedUser.id, createdByName: creator?.name ?? "" },
    });

    return { statusCode: 201, response: formatPayment(payment), message: "Payment registered successfully" };
  }

  /** `POST /bills/:id/payments/pix` — creates a dynamic Pix charge on Mercado Pago; nasce `PENDING` until the webhook confirms it. */
  async createPixCharge({ billId, amount, loggedUser }: { billId: string; amount: number; loggedUser: LoggedUser }) {
    if (!CAN_REGISTER_PAYMENT.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can register payments");
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return badRequest("'amount' must be a positive number");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot register a payment on a ${bill.status} bill`);
    }

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const payment = await prisma.payment.create({
      data: {
        billId,
        method: "PIX",
        amount,
        status: "PENDING",
        createdById: loggedUser.id,
        createdByName: creator?.name ?? "",
      },
    });

    try {
      const charge = await mercadoPago.createPixCharge({
        amount,
        description: `Mesa ${bill.tableNumber} — SelfHub`,
        externalReference: payment.id,
        idempotencyKey: payment.id,
      });

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          pixTxId: charge.id,
          pixQrCode: charge.qrCodeBase64,
          pixCopyPaste: charge.copyPaste,
        },
      });

      return { statusCode: 201, response: formatPayment(updated), message: "Pix charge created successfully" };
    } catch (err: any) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      throw err;
    }
  }

  /** `GET /payments/:id` — polled by the front every ~3s until `status` leaves `PENDING`. */
  async getPayment({ id, loggedUser }: { id: string; loggedUser: LoggedUser }) {
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      return notFound("Payment not found");
    }

    const bill = await prisma.bill.findUnique({ where: { id: payment.billId } });
    if (!bill || bill.restaurantId !== loggedUser.restaurantId) {
      return unauthorized("You don't have access to this payment");
    }

    return { statusCode: 200, response: formatPayment(payment) };
  }
}
