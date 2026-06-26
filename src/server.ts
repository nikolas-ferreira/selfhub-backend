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
import { isAllowedDomainOrigin } from './shared/restaurantDomains'

// A UUID per request (instead of Fastify's default incrementing counter) so
// `request.id` stays unique across restarts/instances and can be used as a
// stable `errorId` to correlate a client-reported error with a log line.
const app = Fastify({ logger: true, genReqId: () => randomUUID() })

// The front-end always sends `Content-Type: application/json` even on
// bodyless requests (e.g. DELETE), which trips Fastify's default JSON parser
// (`FST_ERR_CTP_EMPTY_JSON_BODY`). Treat an empty body as `{}` instead of a
// parse error; a genuinely malformed (non-empty) JSON body still fails as before.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  const raw = body as string
  if (!raw || !raw.trim()) {
    done(null, {})
    return
  }
  try {
    done(null, JSON.parse(raw))
  } catch (err) {
    done(err as Error, undefined)
  }
})

const start = async () => {
  try {
    validateEnv()

    // No CORS_ORIGIN configured means deny all cross-origin requests by default,
    // instead of reflecting back any origin (which combined with credentials:true
    // would be a CSRF-adjacent misconfiguration).
    //
    // Important operational note: when @fastify/cors resolves an origin as
    // denied — whether via the literal `origin: false` or a callback that
    // calls back with `false` — it responds to the OPTIONS preflight with a
    // bare 404 ("Route OPTIONS:/x not found"), not a proper CORS rejection.
    // This is by design in this library (see its `corsPreflightEnabled`
    // handling) and is not a bug here; functionally it still blocks the
    // browser from completing the cross-origin request, but it means ANY
    // legitimate frontend origin that is missing from `CORS_ORIGIN` will see
    // every preflighted request fail as a 404, not just a CORS error. If the
    // API is unreachable from a real frontend, check this env var first.
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim())
    const isProduction = process.env.NODE_ENV === 'production'
    // Any `http(s)://localhost:<port>` or `127.0.0.1:<port>` origin, regardless
    // of port — covers selfhub-admin (8080), selfhub-web (8081), and whatever
    // port a given dev's machine happens to use, without needing CORS_ORIGIN
    // set locally. Never applied in production.
    const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

    await app.register(helmet)

    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    })

    // Beyond the static CORS_ORIGIN allowlist, also accept any origin whose
    // hostname matches a restaurant's registered digital-menu custom domain
    // (Restaurant.domain) — every customer domain points at this same API
    // deploy, so a fixed env var can't enumerate them all. See
    // docs/digital-menu-feature.md §0 and shared/restaurantDomains.ts.
    async function resolveCorsOrigin(origin: string | undefined): Promise<boolean> {
      if (!origin) {
        return Boolean(allowedOrigins?.length)
      }

      if (!isProduction && LOCALHOST_ORIGIN_REGEX.test(origin)) {
        return true
      }

      if (allowedOrigins?.includes(origin)) {
        return true
      }

      return isAllowedDomainOrigin(origin)
    }

    await app.register(cors, {
      origin: (origin, callback) => {
        resolveCorsOrigin(origin).then(
          (allowed) => callback(null, allowed),
          (err) => callback(err, false)
        )
      },
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
