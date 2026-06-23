const REQUIRED_ENV_VARS = ["JWT_SECRET", "DATABASE_URL"] as const

/**
 * Fails the process fast at boot if required configuration is missing,
 * instead of letting the app start and only blow up on the first request
 * that needs `JWT_SECRET` (signing/verifying tokens) or `DATABASE_URL`
 * (any Prisma query). Call this before registering routes/listening.
 */
export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`)
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set — /insights endpoints will fail at request time")
  }

  if (!process.env.CORS_ORIGIN) {
    console.warn("CORS_ORIGIN is not set — CORS will deny all cross-origin requests by default")
  }

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.warn("MERCADOPAGO_ACCESS_TOKEN is not set — POST /bills/:id/payments/pix will fail at request time")
  }

  if (!process.env.PUBLIC_API_BASE_URL) {
    console.warn("PUBLIC_API_BASE_URL is not set — Mercado Pago won't be told a notification_url, relying on its dashboard config instead")
  }

  if (!process.env.FOCUS_NFE_TOKEN) {
    console.warn("FOCUS_NFE_TOKEN is not set — POST /bills/:id/fiscal-document will mark the document as FAILED")
  }
}
