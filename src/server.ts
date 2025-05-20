import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { routes } from './shared/routes'
import { errorHandler } from './shared/middlewares/errorHandler'

const app = Fastify({ logger: true })

const start = async () => {
  try {
    await app.register(cors, {
      origin: [
        'https://preview--hub-orange-admin-panel.lovable.app',
        'https://489d023c-83a8-40ed-adeb-0e617ea00b7e.lovableproject.com'
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
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
