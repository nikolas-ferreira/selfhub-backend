import { OrderStatus } from "../order/OrderStatus";

/**
 * Fixed template names every restaurant must create (identically named) in their own Meta
 * WhatsApp Manager and get approved — see docs/whatsapp-notifications-feature.md for the exact
 * body text to submit. Keeping the names fixed (rather than admin-editable) is a deliberate v1
 * simplification: it lets `OrderNotificationService` call the Cloud API without needing to know
 * per-restaurant template metadata beyond the credentials themselves.
 */
export const WHATSAPP_TEMPLATE_NAMES = {
  ORDER_CREATED: "pedido_confirmado",
  STATUS_CHANGED: "status_pedido",
} as const;

/** Friendly pt-BR text for the `{{3}}` status placeholder in `status_pedido`. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.CREATED]: "Pedido recebido",
  [OrderStatus.PREPARING]: "Em preparo",
  [OrderStatus.COMING]: "Pronto / saindo da cozinha",
  [OrderStatus.IN_ROUTE]: "Em rota de entrega",
  [OrderStatus.DELIVERED]: "Entregue",
  [OrderStatus.FINISHED]: "Finalizado",
  [OrderStatus.CANCELED]: "Cancelado",
};
