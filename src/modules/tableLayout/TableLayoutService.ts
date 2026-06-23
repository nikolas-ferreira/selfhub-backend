import prisma from "../../shared/prisma";
import { badRequest, notFound, unauthorized } from "../../shared/utils/httpResponse";

const TABLE_STATUSES = ["free", "occupied", "reserved", "cleaning"] as const;
type TableStatusValue = (typeof TABLE_STATUSES)[number];

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface TableInput {
  id?: string;
  number: number;
  position: Point | null;
  size?: Size | null;
}

interface WallInput {
  id?: string;
  start: Point;
  end: Point;
  thickness?: number | null;
}

interface SaveLayoutInput {
  tables: TableInput[];
  walls: WallInput[];
  loggedUser: LoggedUser;
}

const formatTable = (table: {
  id: string;
  number: number;
  status: string;
  position: Point | null;
  size: Size | null;
}) => ({
  id: table.id,
  number: table.number,
  status: table.status,
  position: table.position ? { x: table.position.x, y: table.position.y } : null,
  ...(table.size ? { size: { width: table.size.width, height: table.size.height } } : {}),
});

const formatWall = (wall: { id: string; start: Point; end: Point; thickness: number }) => ({
  id: wall.id,
  start: { x: wall.start.x, y: wall.start.y },
  end: { x: wall.end.x, y: wall.end.y },
  thickness: wall.thickness,
});

/**
 * Persistence for the `/tables` floor-plan editor: table positions and
 * decorative walls, scoped per restaurant. `Table.status` (free/occupied/
 * etc.) reflects live order state and is deliberately never touched here —
 * see the spec at `selfhub-admin/docs/table-layout-backend-spec.md`.
 */
export class TableLayoutService {
  async getLayout(loggedUser: LoggedUser) {
    const [tables, walls] = await Promise.all([
      prisma.table.findMany({ where: { restaurantId: loggedUser.restaurantId }, orderBy: { number: "asc" } }),
      prisma.wall.findMany({ where: { restaurantId: loggedUser.restaurantId } }),
    ]);

    return {
      statusCode: 200,
      response: {
        tables: tables.map(formatTable),
        walls: walls.map(formatWall),
      },
    };
  }

  /**
   * Full replace of the restaurant's layout in one transaction: items whose
   * `id` matches an existing row are updated, items with no match are
   * created (a client-generated temp id is never reused as the real id),
   * and any row not present in the payload is deleted. `status` is never
   * part of this write path.
   */
  async saveLayout({ tables, walls, loggedUser }: SaveLayoutInput) {
    if (loggedUser.role === "WAITER") {
      return unauthorized("Only MANAGER or ADMIN can edit the table layout");
    }

    for (const table of tables) {
      if (!Number.isInteger(table.number)) {
        return badRequest("Each table must have an integer 'number'");
      }
    }

    const numbers = tables.map((table) => table.number);
    if (new Set(numbers).size !== numbers.length) {
      return badRequest("Table 'number' must be unique within the restaurant");
    }

    for (const wall of walls) {
      if (!wall.start || typeof wall.start.x !== "number" || typeof wall.start.y !== "number") {
        return badRequest("Each wall must have a valid 'start'");
      }
      if (!wall.end || typeof wall.end.x !== "number" || typeof wall.end.y !== "number") {
        return badRequest("Each wall must have a valid 'end'");
      }
    }

    try {
      const [existingTables, existingWalls] = await Promise.all([
        prisma.table.findMany({ where: { restaurantId: loggedUser.restaurantId }, select: { id: true } }),
        prisma.wall.findMany({ where: { restaurantId: loggedUser.restaurantId }, select: { id: true } }),
      ]);
      const existingTableIds = new Set(existingTables.map((t) => t.id));
      const existingWallIds = new Set(existingWalls.map((w) => w.id));

      const result = await prisma.$transaction(
        async (tx) => {
          const keptTableIds = new Set(
            tables.filter((t) => t.id && existingTableIds.has(t.id)).map((t) => t.id as string)
          );
          const tableIdsToDelete = [...existingTableIds].filter((id) => !keptTableIds.has(id));

          const keptWallIds = new Set(
            walls.filter((w) => w.id && existingWallIds.has(w.id)).map((w) => w.id as string)
          );
          const wallIdsToDelete = [...existingWallIds].filter((id) => !keptWallIds.has(id));

          await Promise.all([
            tableIdsToDelete.length
              ? tx.table.deleteMany({ where: { id: { in: tableIdsToDelete } } })
              : Promise.resolve(),
            wallIdsToDelete.length
              ? tx.wall.deleteMany({ where: { id: { in: wallIdsToDelete } } })
              : Promise.resolve(),
            ...tables.map((table) => {
              const data = {
                number: table.number,
                position: table.position ? { x: table.position.x, y: table.position.y } : null,
                size: table.size ? { width: table.size.width, height: table.size.height } : null,
              };

              return table.id && existingTableIds.has(table.id)
                ? tx.table.update({ where: { id: table.id }, data })
                : tx.table.create({ data: { ...data, restaurantId: loggedUser.restaurantId } });
            }),
            ...walls.map((wall) => {
              const data = {
                start: { x: wall.start.x, y: wall.start.y },
                end: { x: wall.end.x, y: wall.end.y },
                thickness: wall.thickness ?? 8,
              };

              return wall.id && existingWallIds.has(wall.id)
                ? tx.wall.update({ where: { id: wall.id }, data })
                : tx.wall.create({ data: { ...data, restaurantId: loggedUser.restaurantId } });
            }),
          ]);

          const [finalTables, finalWalls] = await Promise.all([
            tx.table.findMany({ where: { restaurantId: loggedUser.restaurantId }, orderBy: { number: "asc" } }),
            tx.wall.findMany({ where: { restaurantId: loggedUser.restaurantId } }),
          ]);

          return { tables: finalTables, walls: finalWalls };
        },
        { timeout: 20000, maxWait: 10000 }
      );

      return {
        statusCode: 200,
        response: {
          tables: result.tables.map(formatTable),
          walls: result.walls.map(formatWall),
        },
        message: "Table layout saved successfully",
      };
    } catch (err: any) {
      if (err?.code === "P2002") {
        return badRequest("Table 'number' must be unique within the restaurant");
      }
      throw err;
    }
  }

  /**
   * Manual status override from the layout editor — independent of "Save Layout".
   * No transition restrictions (any status to any status); only `status`/`updatedAt`
   * change, `number`/`position`/`size` are untouched.
   */
  async updateStatus({
    tableId,
    status,
    loggedUser,
  }: {
    tableId: string;
    status: string;
    loggedUser: LoggedUser;
  }) {
    if (!TABLE_STATUSES.includes(status as TableStatusValue)) {
      return badRequest("'status' must be one of: free, occupied, reserved, cleaning");
    }

    const table = await prisma.table.findFirst({
      where: { id: tableId, restaurantId: loggedUser.restaurantId },
    });

    if (!table) {
      return notFound("Table not found");
    }

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: { status: status as TableStatusValue },
    });

    return {
      statusCode: 200,
      response: formatTable(updated),
      message: "Table status updated successfully",
    };
  }
}
