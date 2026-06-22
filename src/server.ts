import 'dotenv/config'
import { randomUUID } from 'crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { routes } from './shared/routes'
import { errorHandler } from './shared/middlewares/errorHandler'
import { validateEnv } from './shared/env'

// A UUID per request (instead of Fastify's default incrementing counter) so
// `request.id` stays unique across restarts/instances and can be used as a
// stable `errorId` to correlate a client-reported error with a log line.
const app = Fastify({ logger: true, genReqId: () => randomUUID() })

const start = async () => {
  try {
    validateEnv()

    // No CORS_ORIGIN configured means deny all cross-origin requests by default,
    // instead of reflecting back any origin (which combined with credentials:true
    // would be a CSRF-adjacent misconfiguration).
    const allowedOrigins =
      process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) || false

    await app.register(helmet)

    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    })

    await app.register(cors, {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    })

    await app.register(swagger, {
      openapi: {
        info: {
          title: 'SelfHub API',
          description: 'API documentation for the SelfHub backend',
          version: '1.0.0'
        }
      }
    })

    await app.register(swaggerUi, {
      routePrefix: '/docs'
    })

    await app.register(routes)
    app.setErrorHandler(errorHandler)

    const port = Number(process.env.PORT) || 3333
    await app.listen({ port, host: '0.0.0.0' })

    console.log(`🚀 HTTP server running at http://localhost:${port}`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

start()
