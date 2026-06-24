import prisma from "../../shared/prisma";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../shared/utils/httpResponse";
import { formatBill } from "../bill/BillService";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_OPERATE_CASH: Role[] = ["CASHIER", "MANAGER", "ADMIN"];
const CAN_VIEW_HISTORY: Role[] = ["MANAGER", "ADMIN"];
const MOVEMENT_TYPES = ["WITHDRAWAL", "SUPPLY"] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const round2 = (value: number) => Math.round(value * 100) / 100;

const formatMovement = (movement: {
  id: string;
  cashSessionId: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}) => ({
  id: movement.id,
  cashSessionId: movement.cashSessionId,
  type: movement.type,
  amount: movement.amount,
  reason: movement.reason,
  createdAt: movement.createdAt,
  createdById: movement.createdById,
  createdByName: movement.createdByName,
});

/** Caixa shift lifecycle: open/current/close/history + sangria/suprimento — see caixa-backend-spec.md §"Sessão de caixa". */
export class CashSessionService {
  /**
   * Sums confirmed payments (by method) and withdrawal/supply movements for
   * a session — computed live on every response, never persisted, since
   * they keep changing while the session is `OPEN` (see spec §"Atualização
   * — histórico de fechamentos de caixa").
   */
  private async computeAggregates(cashSessionId: string) {
    const [movements, bills] = await Promise.all([
      prisma.cashMovement.findMany({ where: { cashSessionId } }),
      prisma.bill.findMany({ where: { cashSessionId, status: "PAID" }, include: { payments: true } }),
    ]);

    const totalWithdrawals = round2(
      movements.filter((m) => m.type === "WITHDRAWAL").reduce((sum, m) => sum + m.amount, 0)
    );
    const totalSupplies = round2(movements.filter((m) => m.type === "SUPPLY").reduce((sum, m) => sum + m.amount, 0));

    const confirmedPayments = bills.flatMap((bill) => bill.payments).filter((p) => p.status === "CONFIRMED");
    const totalByMethod = { CASH: 0, CARD: 0, PIX: 0 };
    for (const payment of confirmedPayments) {
      totalByMethod[payment.method] += payment.amount;
    }
    totalByMethod.CASH = round2(totalByMethod.CASH);
    totalByMethod.CARD = round2(totalByMethod.CARD);
    totalByMethod.PIX = round2(totalByMethod.PIX);

    const totalSales = round2(totalByMethod.CASH + totalByMethod.CARD + totalByMethod.PIX);

    return { totalSales, totalByMethod, totalWithdrawals, totalSupplies, billsCount: bills.length };
  }

  private async formatSession(session: {
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
    closedById: string | null;
    closedByName: string | null;
  }) {
    const aggregates = await this.computeAggregates(session.id);

    return {
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
      closedById: session.closedById,
      closedByName: session.closedByName,
      ...aggregates,
    };
  }

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

    return { statusCode: 201, response: await this.formatSession(session), message: "Cash session opened successfully" };
  }

  /** `GET /cash-sessions/current` — 404 ("no session") is the expected/normal response, not an error case. */
  async getCurrent({ loggedUser }: { loggedUser: LoggedUser }) {
    const session = await prisma.cashSession.findFirst({
      where: { cashierId: loggedUser.id, restaurantId: loggedUser.restaurantId, status: "OPEN" },
    });

    if (!session) {
      return notFound("No open cash session");
    }

    return { statusCode: 200, response: await this.formatSession(session) };
  }

  /** `POST /cash-sessions/:id/close` — computes `expectedAmount`/`difference` (CASH only) and marks `CLOSED`. */
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

    const aggregates = await this.computeAggregates(id);
    const expectedAmount = round2(
      session.openingAmount + aggregates.totalByMethod.CASH - aggregates.totalWithdrawals + aggregates.totalSupplies
    );
    const difference = round2(closingAmount - expectedAmount);

    const closer = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const updated = await prisma.cashSession.update({
      where: { id },
      data: {
        closingAmount,
        expectedAmount,
        difference,
        status: "CLOSED",
        closedAt: new Date(),
        closedById: loggedUser.id,
        closedByName: closer?.name ?? "",
      },
    });

    return { statusCode: 200, response: await this.formatSession(updated), message: "Cash session closed successfully" };
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

    const creator = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const movement = await prisma.cashMovement.create({
      data: {
        cashSessionId,
        type,
        amount,
        reason: reason.trim(),
        createdById: loggedUser.id,
        createdByName: creator?.name ?? "",
      },
    });

    return { statusCode: 201, response: formatMovement(movement), message: "Movement registered successfully" };
  }

  /**
   * `GET /cash-sessions` — list for the `/cashier/history` admin screen.
   * MANAGER/ADMIN only; a CASHIER can't browse other cashiers' sessions.
   */
  async list({
    restaurantId,
    cashierId,
    status,
    dateFrom,
    dateTo,
    loggedUser,
  }: {
    restaurantId: string;
    cashierId?: string;
    status?: "OPEN" | "CLOSED";
    dateFrom?: string;
    dateTo?: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_VIEW_HISTORY.includes(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can view the cash session history");
    }

    if (restaurantId !== loggedUser.restaurantId) {
      return unauthorized("You don't have access to this restaurant");
    }

    if (status && status !== "OPEN" && status !== "CLOSED") {
      return badRequest("'status' must be OPEN or CLOSED");
    }

    const openedAt: { gte?: Date; lte?: Date } = {};
    if (dateFrom) openedAt.gte = new Date(dateFrom);
    if (dateTo) openedAt.lte = new Date(dateTo);

    const sessions = await prisma.cashSession.findMany({
      where: {
        restaurantId,
        ...(cashierId ? { cashierId } : {}),
        ...(status ? { status } : {}),
        ...(dateFrom || dateTo ? { openedAt } : {}),
      },
      orderBy: { openedAt: "desc" },
    });

    const formatted = await Promise.all(sessions.map((session) => this.formatSession(session)));
    return { statusCode: 200, response: formatted };
  }

  /**
   * `GET /cash-sessions/:id` — detail for the `/cashier/history` admin
   * screen. MANAGER/ADMIN only. Embeds every movement and every `PAID` bill
   * (with its payments) so the front can build the timeline without an
   * extra "log" endpoint.
   */
  async getDetail({ id, loggedUser }: { id: string; loggedUser: LoggedUser }) {
    if (!CAN_VIEW_HISTORY.includes(loggedUser.role)) {
      return forbidden("Only MANAGER or ADMIN can view the cash session history");
    }

    const session = await prisma.cashSession.findFirst({ where: { id, restaurantId: loggedUser.restaurantId } });
    if (!session) {
      return notFound("Cash session not found");
    }

    const [movements, bills] = await Promise.all([
      prisma.cashMovement.findMany({ where: { cashSessionId: id }, orderBy: { createdAt: "asc" } }),
      prisma.bill.findMany({
        where: { cashSessionId: id, status: "PAID" },
        include: { payments: { orderBy: { createdAt: "asc" } } },
        orderBy: { closedAt: "asc" },
      }),
    ]);

    const formattedSession = await this.formatSession(session);

    return {
      statusCode: 200,
      response: {
        ...formattedSession,
        movements: movements.map(formatMovement),
        bills: bills.map((bill) => formatBill(bill, bill.payments)),
      },
    };
  }
}
