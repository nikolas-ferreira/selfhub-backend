import { PrismaClient } from "@prisma/client";

/**
 * Process-wide Prisma client singleton. Imported directly by every
 * service rather than injected — see the RFC (`docs/RFC-001-architecture.md`)
 * for the planned move to constructor injection.
 */
const prismaClient = new PrismaClient();

export default prismaClient;
