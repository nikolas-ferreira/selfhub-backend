import { FastifyReply, FastifyRequest } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, notFound, successResponse } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface GetRestaurantParams {
  Params: {
    cnpj: string;
  };
}

interface GetRestaurantByIdParams {
  Params: {
    id: string;
  };
}

interface GetRestaurantByDomainParams {
  Params: {
    domain: string;
  };
}

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

/**
 * Public restaurant lookups — `GET /restaurant/:cnpj`, `GET /restaurants/:id`
 * (used by the digital menu's QR code, which encodes the `restaurantId`
 * directly) and `GET /restaurants/by-domain/:domain` (used when the digital
 * menu is reached through a restaurant's own custom domain instead — see
 * docs/digital-menu-feature.md §0/§3).
 */
export class GetRestaurantController {
  /** Looks up a restaurant by (sanitized) CNPJ. No Prisma-querying layer below this — talks to the DB directly. */
  async handle(request: FastifyRequest<GetRestaurantParams>, reply: FastifyReply) {
    try {
      const { cnpj } = request.params;

      if (!cnpj) {
        return reply.status(400).send(badRequest("CNPJ is required"));
      }

      const sanitizedCnpj = cnpj.replace(/\D/g, "");

      if (sanitizedCnpj.length !== 14) {
        return reply.status(400).send(badRequest("CNPJ must have 14 digits"));
      }

      const restaurant = await prismaClient.restaurant.findUnique({
        where: { cnpj: sanitizedCnpj },
      });

      if (!restaurant) {
        return reply.status(404).send(notFound("Restaurant not found"));
      }

      return reply.send(successResponse(restaurant));
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch restaurant");
    }
  }

  /** `GET /restaurants/:id` — public lookup by id. */
  async byId(request: FastifyRequest<GetRestaurantByIdParams>, reply: FastifyReply) {
    try {
      const { id } = request.params;

      if (!id || !OBJECT_ID_REGEX.test(id)) {
        return reply.status(400).send(badRequest("Invalid restaurant id"));
      }

      const restaurant = await prismaClient.restaurant.findUnique({ where: { id } });

      if (!restaurant) {
        return reply.status(404).send(notFound("Restaurant not found"));
      }

      return reply.send(successResponse(restaurant));
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch restaurant");
    }
  }

  /** `GET /restaurants/by-domain/:domain` — public lookup by the digital menu's custom domain hostname (no protocol/port). */
  async byDomain(request: FastifyRequest<GetRestaurantByDomainParams>, reply: FastifyReply) {
    try {
      const { domain } = request.params;

      if (!domain?.trim()) {
        return reply.status(400).send(badRequest("domain is required"));
      }

      const restaurant = await prismaClient.restaurant.findUnique({
        where: { domain: domain.trim().toLowerCase() },
      });

      if (!restaurant) {
        return reply.status(404).send(notFound("Restaurant not found"));
      }

      return reply.send(successResponse(restaurant));
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch restaurant");
    }
  }
}

