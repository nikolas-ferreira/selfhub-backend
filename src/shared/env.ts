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
}
