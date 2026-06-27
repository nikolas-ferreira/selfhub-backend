import prisma from "../../shared/prisma"
import { isValidCpf, onlyDigits } from "../../shared/utils/cpf"

interface LoggedUser {
  id: string
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER"
  restaurantId: string
}

interface ListCustomersInput {
  search?: string
  loggedUser: LoggedUser
}

interface GetCustomerInput {
  id: string
  loggedUser: LoggedUser
}

interface UpdateCustomerInput {
  id: string
  name?: string
  phone?: string
  cpf?: string
  loggedUser: LoggedUser
}

/**
 * Read/edit for `Customer` records, scoped per restaurant. Customers are never created here —
 * they're upserted by CPF inside {@link import("../order/CreateOrderService").CreateOrderService}
 * the first time someone places an order with that CPF.
 */
export class CustomerService {
  /** Only MANAGER/ADMIN may view or edit customers — same gate as `DeliveryZoneService`. */
  private hasPermission(role: LoggedUser["role"]) {
    return role === "ADMIN" || role === "MANAGER"
  }

  /** Lists customers for the caller's restaurant, optionally filtered by name or CPF substring. */
  async list({ search, loggedUser }: ListCustomersInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can view customers" }
    }

    const trimmed = search?.trim()
    const digits = trimmed ? onlyDigits(trimmed) : ""

    const customers = await prisma.customer.findMany({
      where: {
        restaurantId: loggedUser.restaurantId,
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: "insensitive" } },
                ...(digits ? [{ cpf: { contains: digits } }] : []),
              ],
            }
          : {}),
      },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
    })

    return { statusCode: 200, response: customers }
  }

  /** Fetches one customer with their full order history (items + product), for the admin detail view. */
  async getById({ id, loggedUser }: GetCustomerInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can view customers" }
    }

    const customer = await prisma.customer.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
      include: {
        orders: {
          orderBy: { orderedAt: "desc" },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, price: true, imageUrl: true } },
                customizations: true,
              },
            },
          },
        },
        discounts: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!customer) {
      return { statusCode: 404, response: null, message: "Customer not found" }
    }

    return { statusCode: 200, response: customer }
  }

  /**
   * Partially updates a customer's registration data (correcting a typo, etc). If `cpf` changes,
   * it's re-validated and checked for uniqueness within the restaurant before saving.
   */
  async update({ id, name, phone, cpf, loggedUser }: UpdateCustomerInput) {
    if (!this.hasPermission(loggedUser.role)) {
      return { statusCode: 403, response: null, message: "Only MANAGER or ADMIN can edit customers" }
    }

    const customer = await prisma.customer.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    })

    if (!customer) {
      return { statusCode: 404, response: null, message: "Customer not found" }
    }

    if (name !== undefined && !name.trim()) {
      return { statusCode: 400, response: null, message: "name cannot be empty" }
    }

    let normalizedPhone: string | undefined
    if (phone !== undefined) {
      normalizedPhone = onlyDigits(phone)
      if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
        return { statusCode: 400, response: null, message: "phone must be a valid phone number" }
      }
    }

    let normalizedCpf: string | undefined
    if (cpf !== undefined) {
      normalizedCpf = onlyDigits(cpf)
      if (!isValidCpf(normalizedCpf)) {
        return { statusCode: 400, response: null, message: "cpf must be a valid CPF" }
      }

      if (normalizedCpf !== customer.cpf) {
        const duplicated = await prisma.customer.findUnique({
          where: { restaurantId_cpf: { restaurantId: loggedUser.restaurantId, cpf: normalizedCpf } },
        })

        if (duplicated) {
          return { statusCode: 409, response: null, message: "Another customer already uses this CPF" }
        }
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name?.trim(),
        phone: normalizedPhone,
        cpf: normalizedCpf,
      },
    })

    return { statusCode: 200, response: updated, message: "Customer updated successfully" }
  }
}
