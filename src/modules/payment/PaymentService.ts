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
/** Estorno é uma operação de alçada — nunca liberada ao próprio CASHIER (fraude nº 1 do setor). */
const CAN_REFUND_PAYMENT: Role[] = ["MANAGER", "ADMIN"];
const MANUAL_METHODS = ["CASH", "CARD"] as const;
type ManualMethod = (typeof MANUAL_METHODS)[number];

const round2 = (value: number) => Math.round(value * 100) / 100;
/** Tolerância de centavos ao comparar valor pago com o restante (evita rejeição por ruído de ponto flutuante). */
const CENTS_EPSILON = 0.005;

/**
 * Soma dos pagamentos que ainda contam para a conta (CONFIRMED). Estornados (REFUNDED),
 * PENDING e FAILED ficam de fora. Usada para calcular o restante e barrar excedente.
 */
export const confirmedPaymentsTotal = (payments: { status: string; amount: number }[]) =>
  round2(payments.filter((p) => p.status === "CONFIRMED").reduce((sum, p) => sum + p.amount, 0));

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
  refundedAt?: Date | null;
  refundedById?: string | null;
  refundedByName?: string | null;
  refundReason?: string | null;
  createdAt: Date;
  createdById: string;
  createdByName: string | null;
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
  refundedAt: payment.refundedAt ?? null,
  refundedById: payment.refundedById ?? null,
  refundedByName: payment.refundedByName ?? null,
  refundReason: payment.refundReason ?? null,
  createdAt: payment.createdAt,
  createdById: payment.createdById,
  // Payments registered before this field existed have it absent in Mongo.
  createdByName: payment.createdByName ?? "",
});

/** Payment registration/lookup for a `Bill` — see caixa-backend-spec.md §"Pagamentos". */
export class PaymentService {
  /**
   * How much is still owed on the bill: `total - sum(CONFIRMED payments)`, plus whatever is
   * already tied up in a PENDING Pix charge (so a second charge can't be raised for money that's
   * already being collected). Registering more than this is rejected — the drawer's change (troco)
   * is handled on the front and never sent as a payment, so no method should ever exceed the balance.
   */
  private async remainingBalance(bill: { id: string; total: number }) {
    const payments = await prisma.payment.findMany({ where: { billId: bill.id } });
    const committed = round2(
      payments.filter((p) => p.status === "CONFIRMED" || p.status === "PENDING").reduce((sum, p) => sum + p.amount, 0)
    );
    return round2(bill.total - committed);
  }

  /** `POST /bills/:id/payments` — CASH/CARD are confirmed manually, no TEF involved. */
  async registerPayment({
    billId,
    method,
    amount,
    idempotencyKey,
    loggedUser,
  }: {
    billId: string;
    method: ManualMethod;
    amount: number;
    idempotencyKey?: string;
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

    // Idempotency: a double-click / retry carries the same key, so the second one returns the
    // payment the first created instead of registering it twice (money duplication). See spec.
    if (idempotencyKey) {
      const existing = await prisma.payment.findFirst({ where: { billId, idempotencyKey } });
      if (existing) {
        return { statusCode: 200, response: formatPayment(existing), message: "Payment already registered" };
      }
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot register a payment on a ${bill.status} bill`);
    }

    const remaining = await this.remainingBalance(bill);
    if (amount > remaining + CENTS_EPSILON) {
      return badRequest("Payment amount exceeds the bill's remaining balance");
    }

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const payment = await prisma.payment.create({
      data: {
        billId,
        method,
        amount: round2(amount),
        status: "CONFIRMED",
        idempotencyKey: idempotencyKey ?? null,
        createdById: loggedUser.id,
        createdByName: creator?.name ?? "",
      },
    });

    return { statusCode: 201, response: formatPayment(payment), message: "Payment registered successfully" };
  }

  /** `POST /bills/:id/payments/pix` — creates a dynamic Pix charge on Mercado Pago; nasce `PENDING` until the webhook confirms it. */
  async createPixCharge({
    billId,
    amount,
    idempotencyKey,
    loggedUser,
  }: {
    billId: string;
    amount: number;
    idempotencyKey?: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_REGISTER_PAYMENT.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can register payments");
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return badRequest("'amount' must be a positive number");
    }

    if (idempotencyKey) {
      const existing = await prisma.payment.findFirst({ where: { billId, idempotencyKey } });
      if (existing) {
        return { statusCode: 200, response: formatPayment(existing), message: "Pix charge already created" };
      }
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "OPEN") {
      return badRequest(`Cannot register a payment on a ${bill.status} bill`);
    }

    const remaining = await this.remainingBalance(bill);
    if (amount > remaining + CENTS_EPSILON) {
      return badRequest("Payment amount exceeds the bill's remaining balance");
    }

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const payment = await prisma.payment.create({
      data: {
        billId,
        method: "PIX",
        amount: round2(amount),
        status: "PENDING",
        idempotencyKey: idempotencyKey ?? null,
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

  /**
   * `POST /payments/:id/refund` — estorno de um pagamento. Alçada de MANAGER/ADMIN, motivo
   * obrigatório. A linha original é preservada (nunca apagada): vira `REFUNDED` e guarda
   * quem/porquê/quando. Como os totais da sessão e o "restante" só contam `CONFIRMED`, o estorno
   * reflete sozinho na quebra de caixa (dinheiro devolvido sai do esperado da gaveta).
   */
  async refundPayment({ paymentId, reason, loggedUser }: { paymentId: string; reason: string; loggedUser: LoggedUser }) {
    if (!CAN_REFUND_PAYMENT.includes(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can refund a payment");
    }

    if (!reason?.trim()) {
      return badRequest("'reason' is required to refund a payment");
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return notFound("Payment not found");
    }

    const bill = await prisma.bill.findUnique({ where: { id: payment.billId } });
    if (!bill || bill.restaurantId !== loggedUser.restaurantId) {
      return unauthorized("You don't have access to this payment");
    }

    if (payment.status === "REFUNDED") {
      return badRequest("Payment is already refunded");
    }

    // A PENDING Pix isn't money in hand yet — there's nothing to give back. Cancel/expire the
    // charge instead. Only a CONFIRMED payment can be reversed.
    if (payment.status !== "CONFIRMED") {
      return badRequest(`Cannot refund a ${payment.status} payment`);
    }

    const actor = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundedById: loggedUser.id,
        refundedByName: actor?.name ?? "",
        refundReason: reason.trim(),
      },
    });

    return { statusCode: 200, response: formatPayment(updated), message: "Payment refunded successfully" };
  }
}
