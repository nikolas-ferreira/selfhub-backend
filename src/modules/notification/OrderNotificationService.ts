import { Order } from "@prisma/client";
import prisma from "../../shared/prisma";
import { decryptToken } from "../../shared/crypto";
import { OrderStatus } from "../order/OrderStatus";
import { ORDER_STATUS_LABEL, WHATSAPP_TEMPLATE_NAMES } from "./WhatsAppTemplates";
import { formatPhoneForWhatsApp, sendTemplateMessage } from "./WhatsAppClient";

/**
 * Fires the WhatsApp notifications for order lifecycle events. Called from `CreateOrderService`
 * (on creation) and `EditOrderStatusService` (on status transitions) — both unauthenticated/internal
 * call sites, so every check that matters (restaurant opted in, event enabled, customer consented)
 * happens here rather than at the call site.
 *
 * Deliberately fire-and-forget from the caller's perspective: every public method swallows its own
 * errors (logs and returns) so a WhatsApp/Meta outage never fails order creation or a status update.
 */
export class OrderNotificationService {
  async notifyOrderCreated(order: Order): Promise<void> {
    try {
      const config = await this.getSendableConfig(order);
      if (!config || !config.notifyOnCreated) return;

      await sendTemplateMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken: decryptToken(config.accessToken),
        to: formatPhoneForWhatsApp(order.customerPhone!),
        templateName: WHATSAPP_TEMPLATE_NAMES.ORDER_CREATED,
        bodyParams: [order.customerName || "Cliente", order.orderNumber],
      });
    } catch (err) {
      console.error(`[OrderNotificationService] Failed to notify order ${order.id} created`, err);
    }
  }

  async notifyStatusChanged(order: Order, status: OrderStatus): Promise<void> {
    try {
      const config = await this.getSendableConfig(order);
      if (!config || !config.notifyOnStatuses.includes(status)) return;

      await sendTemplateMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken: decryptToken(config.accessToken),
        to: formatPhoneForWhatsApp(order.customerPhone!),
        templateName: WHATSAPP_TEMPLATE_NAMES.STATUS_CHANGED,
        bodyParams: [order.customerName || "Cliente", order.orderNumber, ORDER_STATUS_LABEL[status]],
      });
    } catch (err) {
      console.error(`[OrderNotificationService] Failed to notify order ${order.id} status change`, err);
    }
  }

  /** Returns `null` when there's nothing to send to (no phone, no consent, no/inactive config). */
  private async getSendableConfig(order: Order) {
    if (!order.customerPhone || !order.customerAcceptsWhatsApp) return null;

    const config = await prisma.restaurantWhatsAppConfig.findUnique({
      where: { restaurantId: order.restaurantId },
    });

    if (!config || !config.isActive) return null;

    return config;
  }
}
