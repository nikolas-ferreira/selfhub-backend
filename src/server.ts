import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { routes } from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app = Fastify({ logger: true });

app.setErrorHandler(errorHandler);

const start = async () => {
  try {
    await app.register(cors);
    await app.register(routes);

    const port = Number(process.env.PORT) || 3333;
    await app.listen({ port, host: '0.0.0.0' });

    console.log(`🚀 HTTP server running at http://localhost:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
