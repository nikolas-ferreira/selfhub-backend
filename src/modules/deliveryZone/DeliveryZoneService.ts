import prisma from "../../shared/prisma"

interface LoggedUser {
  id: string
  role: "WAITER" | "MANAGER" | "ADMIN"
  restaurantId: string
}

interface CreateDeliveryZoneInput {
  name: string
  deliveryFee: number
  estimatedTime?: number
  loggedUser: LoggedUser
}

interface UpdateDeliveryZoneInput {
  id: string
  name?: string
  deliveryFee?: number
  estimatedTime?: number | null
  loggedUser: LoggedUser
}

interface DeleteDeliveryZoneInput {
  id: string
  loggedUser: LoggedUser
}

export class DeliveryZoneService {
  private hasPermission(role: LoggedUser["role"]) {
    return role === "ADMIN" || role === "MANAGER"
  }

  async create({ name, deliveryFee, estimatedTime, loggedUser }: CreateDeliveryZoneInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can manage delivery zones" }
    }

    if (!name?.trim()) {
      return { statusCode: 400, response: null, message: "Delivery zone name is required" }
    }

    if (deliveryFee < 0) {
      return { statusCode: 400, response: null, message: "deliveryFee must be greater than or equal to zero" }
    }

    const duplicated = await prisma.deliveryZone.findFirst({
      where: {
        restaurantId: loggedUser.restaurantId,
        name: name.trim(),
      },
    })

    if (duplicated) {
      return { statusCode: 409, response: null, message: "Delivery zone already exists for this restaurant" }
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        name: name.trim(),
        deliveryFee,
        estimatedTime,
        restaurantId: loggedUser.restaurantId,
        lastEditedBy: loggedUser.id,
      },
    })

    return { statusCode: 201, response: zone, message: "Delivery zone created successfully" }
  }

  async list(loggedUser: LoggedUser) {
    const zones = await prisma.deliveryZone.findMany({
      where: { restaurantId: loggedUser.restaurantId },
      orderBy: { name: "asc" },
    })

    return { statusCode: 200, response: zones }
  }

  async update({ id, name, deliveryFee, estimatedTime, loggedUser }: UpdateDeliveryZoneInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can manage delivery zones" }
    }

    const zone = await prisma.deliveryZone.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    })

    if (!zone) {
      return { statusCode: 404, response: null, message: "Delivery zone not found" }
    }

    if (deliveryFee !== undefined && deliveryFee < 0) {
      return { statusCode: 400, response: null, message: "deliveryFee must be greater than or equal to zero" }
    }

    if (name && name.trim() !== zone.name) {
      const duplicated = await prisma.deliveryZone.findFirst({
        where: {
          restaurantId: loggedUser.restaurantId,
          name: name.trim(),
          id: { not: id },
        },
      })

      if (duplicated) {
        return { statusCode: 409, response: null, message: "Delivery zone already exists for this restaurant" }
      }
    }

    const updated = await prisma.deliveryZone.update({
      where: { id },
      data: {
        name: name?.trim(),
        deliveryFee,
        estimatedTime,
        lastEditedBy: loggedUser.id,
      },
    })

    return { statusCode: 200, response: updated, message: "Delivery zone updated successfully" }
  }

  async remove({ id, loggedUser }: DeleteDeliveryZoneInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can manage delivery zones" }
    }

    const zone = await prisma.deliveryZone.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    })

    if (!zone) {
      return { statusCode: 404, response: null, message: "Delivery zone not found" }
    }

    const hasOrders = await prisma.order.findFirst({
      where: { deliveryZoneId: id },
      select: { id: true },
    })

    if (hasOrders) {
      const deactivated = await prisma.deliveryZone.update({
        where: { id },
        data: {
          isActive: false,
          lastEditedBy: loggedUser.id,
        },
      })

      return {
        statusCode: 200,
        response: deactivated,
        message: "Delivery zone deactivated because it has related orders",
      }
    }

    const deleted = await prisma.deliveryZone.update({
      where: { id },
      data: {
        isActive: false,
        lastEditedBy: loggedUser.id,
      },
    })

    return { statusCode: 200, response: deleted, message: "Delivery zone deactivated successfully" }
  }
}
