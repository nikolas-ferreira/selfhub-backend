import prisma from "../../shared/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../shared/utils/httpResponse";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

/** Seating guests / handing out comandas is a frontline task, not restricted to Caixa roles. */
const CAN_MANAGE_COMANDAS: Role[] = ["WAITER", "CASHIER", "MANAGER", "ADMIN"];

const formatComanda = (comanda: {
  id: string;
  restaurantId: string;
  number: number;
  tableNumber: number;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  openedById: string;
  openedByName: string;
}) => ({
  id: comanda.id,
  restaurantId: comanda.restaurantId,
  number: comanda.number,
  tableNumber: comanda.tableNumber,
  status: comanda.status,
  openedAt: comanda.openedAt,
  closedAt: comanda.closedAt,
  openedById: comanda.openedById,
  openedByName: comanda.openedByName,
});

/**
 * Comandas — see selfhub-admin/docs/comandas-backend-spec.md. A table may
 * have any number of `OPEN` comandas simultaneously; closing one (via
 * `BillService#closeBill`) never implies the table is free — the front
 * checks for remaining open comandas at that table before freeing it.
 */
export class ComandaService {
  /** `POST /comandas` — 409 if a comanda with this `number` is already `OPEN` in the restaurant. */
  async open({ number, tableNumber, loggedUser }: { number: number; tableNumber: number; loggedUser: LoggedUser }) {
    if (!CAN_MANAGE_COMANDAS.includes(loggedUser.role)) {
      return forbidden("You don't have permission to open a comanda");
    }

    if (!Number.isInteger(number) || number <= 0) {
      return badRequest("'number' must be a positive integer");
    }

    if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
      return badRequest("'tableNumber' must be a positive integer");
    }

    const existing = await prisma.comanda.findFirst({
      where: { restaurantId: loggedUser.restaurantId, number, status: "OPEN" },
    });

    if (existing) {
      return conflict(`Comanda ${number} is already open`);
    }

    const opener = await prisma.profile.findUnique({ where: { id: loggedUser.id } });

    const comanda = await prisma.comanda.create({
      data: {
        restaurantId: loggedUser.restaurantId,
        number,
        tableNumber,
        openedById: loggedUser.id,
        openedByName: opener?.name ?? "",
      },
    });

    return { statusCode: 201, response: formatComanda(comanda), message: "Comanda opened successfully" };
  }

  /** `GET /comandas/by-number/:number` — 404 ("no open comanda") is the expected/normal response, not an error case. */
  async findOpenByNumber({
    number,
    restaurantId,
    loggedUser,
  }: {
    number: number;
    restaurantId: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_MANAGE_COMANDAS.includes(loggedUser.role)) {
      return forbidden("You don't have permission to look up comandas");
    }

    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    const comanda = await prisma.comanda.findFirst({
      where: { restaurantId, number, status: "OPEN" },
    });

    if (!comanda) {
      return notFound("No open comanda with this number");
    }

    return { statusCode: 200, response: formatComanda(comanda) };
  }

  /** `GET /tables/:tableNumber/comandas` — lists comandas at a table, optionally filtered by status. */
  async listByTable({
    tableNumber,
    restaurantId,
    status,
    loggedUser,
  }: {
    tableNumber: number;
    restaurantId: string;
    status?: "OPEN" | "CLOSED";
    loggedUser: LoggedUser;
  }) {
    if (!CAN_MANAGE_COMANDAS.includes(loggedUser.role)) {
      return forbidden("You don't have permission to look up comandas");
    }

    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    const comandas = await prisma.comanda.findMany({
      where: { restaurantId, tableNumber, ...(status ? { status } : {}) },
      orderBy: { openedAt: "asc" },
    });

    return { statusCode: 200, response: comandas.map(formatComanda) };
  }
}
