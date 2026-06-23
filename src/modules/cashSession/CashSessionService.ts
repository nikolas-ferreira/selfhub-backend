import prisma from "../../shared/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../shared/utils/httpResponse";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_OPERATE_CASH: Role[] = ["CASHIER", "MANAGER", "ADMIN"];
const MOVEMENT_TYPES = ["WITHDRAWAL", "SUPPLY"] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const formatSession = (session: {
  id: string;
  restaurantId: string;
  cashierId: string;
  cashierName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  status: string;
}) => ({
  id: session.id,
  restaurantId: session.restaurantId,
  cashierId: session.cashierId,
  cashierName: session.cashierName,
  openedAt: session.openedAt,
  closedAt: session.closedAt,
  openingAmount: session.openingAmount,
  closingAmount: session.closingAmount,
  expectedAmount: session.expectedAmount,
  difference: session.difference,
  status: session.status,
});

const formatMovement = (movement: {
  id: string;
  cashSessionId: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: Date;
  createdById: string;
}) => ({
  id: movement.id,
  cashSessionId: movement.cashSessionId,
  type: movement.type,
  amount: movement.amount,
  reason: movement.reason,
  createdAt: movement.createdAt,
  createdById: movement.createdById,
});

/** Caixa shift lifecycle: open/current/close + sangria/suprimento — see caixa-backend-spec.md §"Sessão de caixa". */
export class CashSessionService {
  /** `POST /cash-sessions` — 409 if the caller already has an `OPEN` session (one per `Staff` at a time). */
  async open({ openingAmount, loggedUser }: { openingAmount: number; loggedUser: LoggedUser }) {
    if (!CAN_OPERATE_CASH.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can open a cash session");
    }

    if (typeof openingAmount !== "number" || !Number.isFinite(openingAmount) || openingAmount < 0) {
      return badRequest("'openingAmount' must be a non-negative number");
    }

    const existing = await prisma.cashSession.findFirst({
      where: { cashierId: loggedUser.id, status: "OPEN" },
    });

    if (existing) {
      return conflict("You already have an open cash session");
    }

    const cashier = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const session = await prisma.cashSession.create({
      data: {
        restaurantId: loggedUser.restaurantId,
        cashierId: loggedUser.id,
        cashierName: cashier?.name ?? "",
        openingAmount,
      },
    });

    return { statusCode: 201, response: formatSession(session), message: "Cash session opened successfully" };
  }

  /** `GET /cash-sessions/current` — 404 ("no session") is the expected/normal response, not an error case. */
  async getCurrent({ loggedUser }: { loggedUser: LoggedUser }) {
    const session = await prisma.cashSession.findFirst({
      where: { cashierId: loggedUser.id, restaurantId: loggedUser.restaurantId, status: "OPEN" },
    });

    if (!session) {
      return notFound("No open cash session");
    }

    return { statusCode: 200, response: formatSession(session) };
  }

  /** `POST /cash-sessions/:id/close` — computes `expectedAmount`/`difference` and marks `CLOSED`. */
  async close({ id, closingAmount, loggedUser }: { id: string; closingAmount: number; loggedUser: LoggedUser }) {
    if (typeof closingAmount !== "number" || !Number.isFinite(closingAmount) || closingAmount < 0) {
      return badRequest("'closingAmount' must be a non-negative number");
    }

    const session = await prisma.cashSession.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    });

    if (!session) {
      return notFound("Cash session not found");
    }

    if (session.cashierId !== loggedUser.id && loggedUser.role !== "ADMIN" && loggedUser.role !== "MANAGER") {
      return forbidden("You can only close your own cash session");
    }

    if (session.status === "CLOSED") {
      return badRequest("Cash session is already closed");
    }

    const [movements, bills] = await Promise.all([
      prisma.cashMovement.findMany({ where: { cashSessionId: id } }),
      prisma.bill.findMany({ where: { cashSessionId: id, status: "PAID" }, include: { payments: true } }),
    ]);

    const withdrawals = movements.filter((m) => m.type === "WITHDRAWAL").reduce((sum, m) => sum + m.amount, 0);
    const supplies = movements.filter((m) => m.type === "SUPPLY").reduce((sum, m) => sum + m.amount, 0);
    const cashSales = bills.reduce((sum, bill) => {
      const billCash = bill.payments
        .filter((p) => p.method === "CASH" && p.status === "CONFIRMED")
        .reduce((s, p) => s + p.amount, 0);
      return sum + billCash;
    }, 0);

    const expectedAmount = session.openingAmount + cashSales - withdrawals + supplies;
    const difference = closingAmount - expectedAmount;

    const updated = await prisma.cashSession.update({
      where: { id },
      data: { closingAmount, expectedAmount, difference, status: "CLOSED", closedAt: new Date() },
    });

    return { statusCode: 200, response: formatSession(updated), message: "Cash session closed successfully" };
  }

  /** `POST /cash-sessions/:id/movements` — registers a sangria (`WITHDRAWAL`) or suprimento (`SUPPLY`). */
  async createMovement({
    cashSessionId,
    type,
    amount,
    reason,
    loggedUser,
  }: {
    cashSessionId: string;
    type: MovementType;
    amount: number;
    reason: string;
    loggedUser: LoggedUser;
  }) {
    if (!MOVEMENT_TYPES.includes(type)) {
      return badRequest("'type' must be WITHDRAWAL or SUPPLY");
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return badRequest("'amount' must be a positive number");
    }

    if (!reason?.trim()) {
      return badRequest("'reason' is required");
    }

    const session = await prisma.cashSession.findFirst({
      where: { id: cashSessionId, restaurantId: loggedUser.restaurantId },
    });

    if (!session) {
      return notFound("Cash session not found");
    }

    if (session.status === "CLOSED") {
      return badRequest("Cannot register a movement on a closed cash session");
    }

    const movement = await prisma.cashMovement.create({
      data: {
        cashSessionId,
        type,
        amount,
        reason: reason.trim(),
        createdById: loggedUser.id,
      },
    });

    return { statusCode: 201, response: formatMovement(movement), message: "Movement registered successfully" };
  }
}
