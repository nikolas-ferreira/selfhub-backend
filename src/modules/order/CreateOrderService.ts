import prisma from "../../shared/prisma";
import { Prisma } from "@prisma/client";
import { AddressInput, CustomerInput, OrderOrigin } from "./orderTypes";
import { isRestaurantOpenNow } from "../../shared/utils/businessHours";
import { isValidCpf, onlyDigits } from "../../shared/utils/cpf";
import { OrderNotificationService } from "../notification/OrderNotificationService";

interface CustomizationOptionInput {
  optionId: string;
  name: string;
  additionalPrice: number;
  quantity: number;
}

interface CreateOrderItem {
  productId: string;
  quantity: number;
  observation: string;
  ratingStar: number;
  imageUrl: string;
  customizationOptions: CustomizationOptionInput[];
}

export interface CreateOrderRequest {
  orderNumber: number;
  /** Ignored for LOCAL orders when `comandaId` is given — derived server-side from the comanda instead. */
  tableNumber: number;
  /** Required when `origin` is (or defaults to) LOCAL — see comandas-backend-spec.md. Absent for DELIVERY/PICKUP. */
  comandaId?: string;
  waiterNumber: number;
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "MONEY";
  totalValue: number;
  restaurantId: string;
  origin?: OrderOrigin;
  deliveryZoneId?: string | null;
  address?: AddressInput;
  /** Required for every origin — see {@link CustomerInput}. Used to find-or-create the `Customer` by CPF. */
  customer: CustomerInput;
  items: CreateOrderItem[];
}

/**
 * Creates an order placed by an unauthenticated caller (table QR code / guest checkout).
 *
 * Because this endpoint has no auth, nothing from the request is trusted for
 * pricing or tenancy: `restaurantId` and every `productId` are verified to
 * exist and belong together, every customization `optionId` is verified to
 * belong to that product, and `totalValue` (including customization prices)
 * is always recomputed from the catalog rather than accepted from the client.
 */
export class CreateOrderService {
  /**
   * @throws {Error} for any validation failure (missing/invalid restaurant,
   * empty/invalid items, product not in this restaurant's catalog, or
   * inconsistent delivery-zone/address data) — the controller maps these to 400.
   */
  async execute(data: CreateOrderRequest) {
    if (!data.restaurantId || !/^[0-9a-fA-F]{24}$/.test(data.restaurantId)) {
      throw new Error("Invalid restaurantId");
    }

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Items array is required");
    }

    for (const item of data.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new Error("Each item requires a valid productId and a positive quantity");
      }

      for (const opt of item.customizationOptions || []) {
        if (!opt.optionId || !/^[0-9a-fA-F]{24}$/.test(opt.optionId)) {
          throw new Error("Each customization option requires a valid optionId");
        }
      }
    }

    if (!data.customer?.name?.trim()) {
      throw new Error("customer.name is required");
    }

    const customerPhone = onlyDigits(data.customer.phone || "");
    if (customerPhone.length < 10 || customerPhone.length > 11) {
      throw new Error("customer.phone must be a valid phone number");
    }

    const customerCpf = onlyDigits(data.customer.cpf || "");
    if (!isValidCpf(customerCpf)) {
      throw new Error("customer.cpf must be a valid CPF");
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: data.restaurantId },
    });

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    if (!isRestaurantOpenNow(restaurant.businessHours)) {
      throw new Error("O restaurante está fechado no momento. Pedidos só podem ser feitos durante o horário de funcionamento.");
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: data.items.map((item) => item.productId) },
        category: { restaurantId: data.restaurantId },
      },
      include: { customizationGroups: { include: { options: true } } },
    });

    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of data.items) {
      if (!productById.has(item.productId)) {
        throw new Error(`Product ${item.productId} does not belong to this restaurant`);
      }
    }

    // Customization option prices are never trusted from the client: each
    // optionId is resolved against the product's own catalog so the price
    // persisted is always the real CustomizationOption.price.
    const optionById = new Map(
      products.flatMap((product) => product.customizationGroups.flatMap((group) => group.options)).map((opt) => [opt.id, opt])
    );

    for (const item of data.items) {
      const product = productById.get(item.productId)!;
      const validOptionIds = new Set(product.customizationGroups.flatMap((group) => group.options.map((opt) => opt.id)));

      for (const opt of item.customizationOptions || []) {
        if (!validOptionIds.has(opt.optionId)) {
          throw new Error(`Customization option ${opt.optionId} does not belong to product ${item.productId}`);
        }
      }
    }

    // Prices are always recomputed server-side from the catalog; client-supplied
    // totalValue/prices are never trusted.
    const totalValue = data.items.reduce((sum, item) => {
      const product = productById.get(item.productId)!;
      const customizationsTotal = (item.customizationOptions || []).reduce(
        (acc, opt) => acc + optionById.get(opt.optionId)!.price * opt.quantity,
        0
      );
      return sum + (product.price + customizationsTotal) * item.quantity;
    }, 0);

    const origin: OrderOrigin = data.origin || "LOCAL";
    let deliveryFee: number | null = null;
    let estimatedDeliveryTime: number | null = null;
    let deliveryZoneId: string | null = null;
    let address: Prisma.InputJsonValue | null = null;

    // LOCAL orders are placed against a comanda, not a freely-typed table
    // number — the table is derived from the comanda, never trusted from the
    // client. See selfhub-admin/docs/comandas-backend-spec.md.
    let tableNumber = data.tableNumber;
    let comandaId: string | null = null;
    let comandaNumber: number | null = null;
    let table: { id: string; status: string } | null = null;

    if (origin === "LOCAL") {
      if (!data.comandaId || !/^[0-9a-fA-F]{24}$/.test(data.comandaId)) {
        throw new Error("comandaId is required for LOCAL orders");
      }

      const comanda = await prisma.comanda.findFirst({
        where: { id: data.comandaId, restaurantId: data.restaurantId, status: "OPEN" },
      });

      if (!comanda) {
        throw new Error("Comanda not found, not open, or doesn't belong to this restaurant");
      }

      comandaId = comanda.id;
      comandaNumber = comanda.number;
      tableNumber = comanda.tableNumber;

      // Defense in depth: the table could have been removed from the floor
      // plan after the comanda was opened against it.
      table = await prisma.table.findFirst({
        where: { restaurantId: data.restaurantId, number: tableNumber },
      });
      if (!table) {
        throw new Error("Mesa não encontrada para este restaurante.");
      }
    } else if (data.comandaId) {
      throw new Error("comandaId must be null when origin is not LOCAL");
    }

    if (origin === "DELIVERY") {
      if (!data.deliveryZoneId) {
        throw new Error("deliveryZoneId is required for delivery orders");
      }

      if (!data.address) {
        throw new Error("address is required for delivery orders");
      }

      const zone = await prisma.deliveryZone.findFirst({
        where: {
          id: data.deliveryZoneId,
          restaurantId: data.restaurantId,
          isActive: true,
        },
      });

      if (!zone) {
        throw new Error("Delivery zone not found for this restaurant");
      }

      deliveryFee = zone.deliveryFee;
      estimatedDeliveryTime = zone.estimatedTime || null;
      deliveryZoneId = zone.id;
      address = data.address as unknown as Prisma.InputJsonValue;
    } else {
      if (data.deliveryZoneId) {
        throw new Error("deliveryZoneId must be null when origin is not DELIVERY");
      }
    }

    const customerName = data.customer.name.trim();
    const acceptsWhatsApp = data.customer.acceptsWhatsApp ?? true;
    const existingCustomer = await prisma.customer.findUnique({
      where: { restaurantId_cpf: { restaurantId: data.restaurantId, cpf: customerCpf } },
    });

    const customer = existingCustomer
      ? await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: customerName,
            phone: customerPhone,
            acceptsWhatsApp,
            ...(address ? { address } : {}),
          },
        })
      : await prisma.customer.create({
          data: {
            restaurantId: data.restaurantId,
            cpf: customerCpf,
            name: customerName,
            phone: customerPhone,
            acceptsWhatsApp,
            ...(address ? { address } : {}),
          },
        });

    // Claim this customer's ACTIVE discount (if any) before creating the order: the `updateMany`
    // filtered on `status: "ACTIVE"` only succeeds once even under a concurrent double-submit, so
    // it can never be applied to two orders. A lost race (count === 0) just means no discount here.
    const activeDiscount = await prisma.customerDiscount.findFirst({
      where: { customerId: customer.id, restaurantId: data.restaurantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });

    let discountAmount = 0;
    let claimedDiscountId: string | null = null;
    if (activeDiscount) {
      const claimed = await prisma.customerDiscount.updateMany({
        where: { id: activeDiscount.id, status: "ACTIVE" },
        data: { status: "USED", usedAt: new Date() },
      });
      if (claimed.count === 1) {
        claimedDiscountId = activeDiscount.id;
        const rawAmount =
          activeDiscount.discountPercent != null
            ? (totalValue * activeDiscount.discountPercent) / 100
            : Math.min(activeDiscount.discountAmount ?? 0, totalValue);
        discountAmount = Math.round(rawAmount * 100) / 100;
      }
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: String(data.orderNumber),
        status: "CREATED",
        origin,
        orderedAt: new Date(),
        tableNumber: String(tableNumber),
        comandaId,
        comandaNumber,
        waiterNumber: String(data.waiterNumber),
        totalValue: Math.round((totalValue - discountAmount) * 100) / 100,
        discountAmount: claimedDiscountId ? discountAmount : null,
        customerDiscountId: claimedDiscountId,
        paymentMethod: data.paymentMethod,
        restaurantId: data.restaurantId,
        deliveryZoneId,
        deliveryFee,
        estimatedDeliveryTime,
        address,
        customerId: customer.id,
        customerName,
        customerCpf,
        customerPhone,
        customerAcceptsWhatsApp: acceptsWhatsApp,
        items: {
          create: data.items.map((item) => ({
            product: { connect: { id: item.productId } },
            quantity: item.quantity,
            imageUrl: item.imageUrl,
            observation: item.observation,
            ratingStar: item.ratingStar,
            customizations: {
              create: (item.customizationOptions || []).map((opt) => ({
                customizationOptionId: opt.optionId,
                name: optionById.get(opt.optionId)!.name,
                additionalPrice: optionById.get(opt.optionId)!.price,
                quantity: opt.quantity,
              })),
            },
          })),
        },
      },
    });

    if (origin === "LOCAL" && table && table.status !== "occupied") {
      await prisma.table.update({ where: { id: table.id }, data: { status: "occupied" } });
    }

    if (claimedDiscountId) {
      await prisma.customerDiscount.update({ where: { id: claimedDiscountId }, data: { usedOrderId: order.id } });
    }

    // Fire-and-forget: OrderNotificationService swallows its own errors, so a WhatsApp/Meta
    // outage never fails order creation. Not awaited, so it doesn't add latency to the response.
    void new OrderNotificationService().notifyOrderCreated(order);

    return order;
  }
}
