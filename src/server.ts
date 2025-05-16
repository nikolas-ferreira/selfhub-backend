import Fastify from "fastify";
import cors from "@fastify/cors";
import { routes } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = Fastify({ logger: true });

app.setErrorHandler(errorHandler);

const start = async () => {
  try {
    await app.register(cors);

    await app.register(routes);

    await app.listen({ port: 3333 });
    console.log("🚀 HTTP server running at http://localhost:3333");
  } catch (error) {
    app.log.error(error);
    process.exit(1); 
  }
};

start();