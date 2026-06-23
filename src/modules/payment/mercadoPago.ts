/**
 * Thin wrapper around the Mercado Pago Payments API for dynamic PIX charges.
 * Credentials (`MERCADOPAGO_ACCESS_TOKEN`) live only here, server-side — the
 * front-end never talks to Mercado Pago directly (see caixa-backend-spec.md
 * §"Regra de segurança mais importante"). Confirmation arrives later via the
 * Mercado Pago webhook (see MercadoPagoWebhookController), not from these
 * calls' return value alone.
 */

const MERCADO_PAGO_BASE_URL = "https://api.mercadopago.com";

export interface PixChargeResult {
  /** Mercado Pago's payment id — used as `pixTxId` and the webhook idempotency key. */
  id: string;
  status: string;
  qrCodeBase64: string | null;
  copyPaste: string | null;
}

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
  }
  return token;
}

/** Creates a Pix charge for the exact `amount`. `idempotencyKey` should be stable per attempt (e.g. the `Payment.id`). */
export async function createPixCharge({
  amount,
  description,
  externalReference,
  idempotencyKey,
  payerEmail,
}: {
  amount: number;
  description: string;
  externalReference: string;
  idempotencyKey: string;
  payerEmail?: string;
}): Promise<PixChargeResult> {
  const token = getAccessToken();

  const notificationUrl = process.env.PUBLIC_API_BASE_URL
    ? `${process.env.PUBLIC_API_BASE_URL}/webhooks/mercadopago`
    : undefined;

  const response = await fetch(`${MERCADO_PAGO_BASE_URL}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: amount,
      description,
      payment_method_id: "pix",
      external_reference: externalReference,
      notification_url: notificationUrl,
      payer: { email: payerEmail || "cliente@selfhub.app" },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to create Mercado Pago Pix charge");
  }

  const transactionData = data.point_of_interaction?.transaction_data;

  return {
    id: String(data.id),
    status: data.status,
    qrCodeBase64: transactionData?.qr_code_base64 ?? null,
    copyPaste: transactionData?.qr_code ?? null,
  };
}

/** Fetches the current state of a payment from Mercado Pago — used by the webhook handler to confirm what changed. */
export async function getPayment(paymentId: string): Promise<{ id: string; status: string }> {
  const token = getAccessToken();

  const response = await fetch(`${MERCADO_PAGO_BASE_URL}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to fetch Mercado Pago payment");
  }

  return { id: String(data.id), status: data.status };
}

/** Maps a Mercado Pago payment status to this app's `PaymentStatus`. */
export function mapMercadoPagoStatus(status: string): "CONFIRMED" | "FAILED" | "PENDING" {
  if (status === "approved") return "CONFIRMED";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(status)) return "FAILED";
  return "PENDING";
}
