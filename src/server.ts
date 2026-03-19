import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { routes } from './shared/routes'
import { errorHandler } from './shared/middlewares/errorHandler'

const app = Fastify({ logger: true })

const start = async () => {
  try {
    const allowedOrigins =
      process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) || true

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
