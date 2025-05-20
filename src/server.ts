import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { routes } from './shared/routes';
import { errorHandler } from './shared/middlewares/errorHandler';

const app = Fastify({ logger: true });

const start = async () => {
  try {
    await app.register(cors, {
      origin: ['https://preview--hub-orange-admin-panel.lovable.app'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    await app.register(routes);
    app.setErrorHandler(errorHandler);

    const port = Number(process.env.PORT) || 3333;
    await app.listen({ port, host: '0.0.0.0' });

    console.log(`🚀 HTTP server running at http://localhost:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
