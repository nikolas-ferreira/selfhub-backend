/**
 * Thin wrapper around the Meta WhatsApp Business Cloud API (`graph.facebook.com`) for sending
 * template messages. Each restaurant brings its own `phoneNumberId`/`accessToken` (see
 * `RestaurantWhatsAppConfig`) — there's no single shared credential, unlike `mercadoPago.ts`.
 * Only template messages are sent (never free-form text): outside a 24h customer-service window,
 * the Cloud API rejects anything else, and `pedido_confirmado`/`status_pedido` are typically sent
 * well outside that window. See docs/whatsapp-notifications-feature.md.
 */

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";

export interface SendTemplateMessageInput {
  phoneNumberId: string;
  accessToken: string;
  /** Customer's WhatsApp number, already in `formatPhoneForWhatsApp` output format. */
  to: string;
  templateName: string;
  /** Filled into the template body's `{{1}}`, `{{2}}`, ... placeholders, in order. */
  bodyParams: string[];
}

/**
 * Brazilian numbers only (this app has no international customers): prefixes the country code
 * `55` onto the 10/11-digit DDD+number already stored on `Order.customerPhone`/`Customer.phone`
 * (see CreateOrderService — always digits-only, no mask, no leading `+`).
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** @throws {Error} if the Cloud API rejects the request (invalid token, unapproved template, etc). */
export async function sendTemplateMessage({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  bodyParams,
}: SendTemplateMessageInput): Promise<{ messageId: string }> {
  const response = await fetch(`${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to send WhatsApp template message");
  }

  return { messageId: data?.messages?.[0]?.id };
}

/** Validates that `phoneNumberId`/`accessToken` actually work, without sending a message. Used by the "test connection" admin action. */
export async function verifyCredentials(phoneNumberId: string, accessToken: string): Promise<void> {
  const response = await fetch(`${GRAPH_API_BASE_URL}/${phoneNumberId}?fields=id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Invalid WhatsApp credentials");
  }
}
