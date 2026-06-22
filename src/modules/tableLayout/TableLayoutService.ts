import prisma from "../../shared/prisma";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

interface Point {
  x: number;
  y: number;
}

interface TableInput {
  id?: string;
  number: number;
  position: Point | null;
}

interface WallInput {
  id?: string;
  type: "horizontal" | "vertical" | "custom";
  position: Point;
  length: number;
  angle?: number | null;
  points?: Point[] | null;
}

interface SaveLayoutInput {
  tables: TableInput[];
  walls: WallInput[];
  loggedUser: LoggedUser;
}

const formatTable = (table: { id: string; number: number; status: string; position: Point | null }) => ({
  id: table.id,
  number: table.number,
  status: table.status,
  position: table.position ? { x: table.position.x, y: table.position.y } : null,
});

const formatWall = (wall: {
  id: string;
  type: string;
  position: Point;
  length: number;
  angle: number | null;
  points: Point[];
}) => ({
  id: wall.id,
  type: wall.type,
  position: { x: wall.position.x, y: wall.position.y },
  length: wall.length,
  ...(wall.angle !== null ? { angle: wall.angle } : {}),
  ...(wall.points.length ? { points: wall.points.map((p) => ({ x: p.x, y: p.y })) } : {}),
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
      if (!wall.position || typeof wall.position.x !== "number" || typeof wall.position.y !== "number") {
        return badRequest("Each wall must have a valid 'position'");
      }
      if (typeof wall.length !== "number") {
        return badRequest("Each wall must have a numeric 'length'");
      }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingTables = await tx.table.findMany({
          where: { restaurantId: loggedUser.restaurantId },
          select: { id: true },
        });
        const existingTableIds = new Set(existingTables.map((t) => t.id));
        const keptTableIds = new Set(
          tables.filter((t) => t.id && existingTableIds.has(t.id)).map((t) => t.id as string)
        );
        const tableIdsToDelete = [...existingTableIds].filter((id) => !keptTableIds.has(id));

        if (tableIdsToDelete.length) {
          await tx.table.deleteMany({ where: { id: { in: tableIdsToDelete } } });
        }

        for (const table of tables) {
          const data = {
            number: table.number,
            position: table.position ? { x: table.position.x, y: table.position.y } : null,
          };

          if (table.id && existingTableIds.has(table.id)) {
            await tx.table.update({ where: { id: table.id }, data });
          } else {
            await tx.table.create({ data: { ...data, restaurantId: loggedUser.restaurantId } });
          }
        }

        const existingWalls = await tx.wall.findMany({
          where: { restaurantId: loggedUser.restaurantId },
          select: { id: true },
        });
        const existingWallIds = new Set(existingWalls.map((w) => w.id));
        const keptWallIds = new Set(
          walls.filter((w) => w.id && existingWallIds.has(w.id)).map((w) => w.id as string)
        );
        const wallIdsToDelete = [...existingWallIds].filter((id) => !keptWallIds.has(id));

        if (wallIdsToDelete.length) {
          await tx.wall.deleteMany({ where: { id: { in: wallIdsToDelete } } });
        }

        for (const wall of walls) {
          const data = {
            type: wall.type,
            position: { x: wall.position.x, y: wall.position.y },
            length: wall.length,
            angle: wall.angle ?? null,
            points: (wall.points ?? []).map((p) => ({ x: p.x, y: p.y })),
          };

          if (wall.id && existingWallIds.has(wall.id)) {
            await tx.wall.update({ where: { id: wall.id }, data });
          } else {
            await tx.wall.create({ data: { ...data, restaurantId: loggedUser.restaurantId } });
          }
        }

        const [finalTables, finalWalls] = await Promise.all([
          tx.table.findMany({ where: { restaurantId: loggedUser.restaurantId }, orderBy: { number: "asc" } }),
          tx.wall.findMany({ where: { restaurantId: loggedUser.restaurantId } }),
        ]);

        return { tables: finalTables, walls: finalWalls };
      });

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
}
