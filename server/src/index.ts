import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { PrismaClient } from "@prisma/client";
import aiRoutes from "./routes/ai.js";
import queryRoutes from "./routes/query.js";
import sapQueryRoutes from "./routes/sapQuery.js";
import aiPipelineRoutes from "./routes/aiPipeline.js";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());
app.use(helmet());

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { 
      title: "SAP AI Ground Truth API", 
      version: "0.1.0",
      description: "API for SAP AI Query Generation Automation System"
    },
  },
  apis: ["./src/routes/*.ts"],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// AI Routes
app.use("/api/ai", aiRoutes);

// Query Routes
app.use("/api/query", queryRoutes);
app.use("/api/sap-query", sapQueryRoutes);
app.use("/api/ai-pipeline", aiPipelineRoutes);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// placeholder routes: list counts for quick sanity
app.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [mara, vbak, vbap, kna1] = await Promise.all([
      prisma.mARA.count().catch(() => 0),
      prisma.vBAK.count().catch(() => 0),
      prisma.vBAP.count().catch(() => 0),
      prisma.kNA1.count().catch(() => 0),
    ]);
    res.json({ mara, vbak, vbap, kna1 });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => {
  // basic startup log
  // eslint-disable-next-line no-console
  console.log(`HTTP server listening on ${port}`);
});
