import "dotenv/config";
import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { PrismaClient } from "@prisma/client";

const app = fastify({ logger: true });
const prisma = new PrismaClient();

async function main() {
  await app.register(cors);
  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      info: { title: "SAP Sim API", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok" }));

  // placeholder routes: list counts for quick sanity
  app.get("/stats", async () => {
    const [mara, vbak, vbap, kna1] = await Promise.all([
      prisma.mARA.count().catch(() => 0),
      prisma.vBAK.count().catch(() => 0),
      prisma.vBAP.count().catch(() => 0),
      prisma.kNA1.count().catch(() => 0),
    ]);
    return { mara, vbak, vbap, kna1 };
  });

  const port = Number(process.env.PORT || 3001);
  await app.listen({ host: "0.0.0.0", port });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
