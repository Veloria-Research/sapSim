import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ExtractorService } from "../services/extractor.js";
import { SchemaSummarizerAgent } from "../services/schemaSummarizer.js";
import { GroundTruthBuilder } from "../services/groundTruthBuilder.js";
import { SAPQueryGenerator } from "../services/sapQueryGenerator.js";

const router = Router();
const prisma = new PrismaClient();

// Initialize services
const extractorService = new ExtractorService(prisma);
const schemaSummarizerAgent = new SchemaSummarizerAgent(prisma);
const groundTruthBuilder = new GroundTruthBuilder(prisma);
const sapQueryGenerator = new SAPQueryGenerator(prisma);

/**
 * @swagger
 * /api/ai/extract:
 *   post:
 *     summary: Extract table structures and sample data from SAP tables
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully extracted data
 */
router.post("/extract", async (req: Request, res: Response) => {
  try {
    console.log("Starting data extraction...");
    const extractedData = await extractorService.extractAllTables();
    
    // Save extracted data to file
    const filepath = await extractorService.saveExtractedData(extractedData);
    
    res.json({
      success: true,
      data: extractedData,
      filepath,
      message: "Data extraction completed successfully"
    });
  } catch (error) {
    console.error("Extraction error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to extract data",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/summarize-schemas:
 *   post:
 *     summary: Generate semantic summaries for all table schemas
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully generated schema summaries
 */
router.post("/summarize-schemas", async (req: Request, res: Response) => {
  try {
    console.log("Starting schema summarization...");
    
    // First extract the data
    const extractedData = await extractorService.extractAllTables();
    
    // Then generate summaries
    const summaries = await schemaSummarizerAgent.processAllTables(extractedData.tables);
    
    res.json({
      success: true,
      summaries,
      message: "Schema summarization completed successfully"
    });
  } catch (error) {
    console.error("Schema summarization error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate schema summaries",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/build-ground-truth:
 *   post:
 *     summary: Build ground truth graph from table structures
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully built ground truth graph
 */
router.post("/build-ground-truth", async (req: Request, res: Response) => {
  try {
    console.log("Starting ground truth building...");
    
    // Extract table structures
    const extractedData = await extractorService.extractAllTables();
    
    // Build ground truth
    const groundTruth = await groundTruthBuilder.buildGroundTruth(extractedData.tables);
    
    // Validate ground truth
    const validation = groundTruthBuilder.validateGroundTruth(groundTruth);
    
    // Save ground truth
    const groundTruthId = await groundTruthBuilder.saveGroundTruth(groundTruth);
    
    res.json({
      success: true,
      groundTruth,
      validation,
      groundTruthId,
      message: "Ground truth building completed successfully"
    });
  } catch (error) {
    console.error("Ground truth building error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to build ground truth",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/search-schemas:
 *   post:
 *     summary: Search for similar schemas using semantic similarity
 *     tags: [AI Agents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query for finding similar schemas
 *               limit:
 *                 type: number
 *                 description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Successfully found similar schemas
 */
router.post("/search-schemas", async (req: Request, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query parameter is required"
      });
    }
    
    const similarSchemas = await schemaSummarizerAgent.findSimilarSchemas(query, limit);
    
    res.json({
      success: true,
      query,
      results: similarSchemas,
      message: "Schema search completed successfully"
    });
  } catch (error) {
    console.error("Schema search error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search schemas",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/ground-truth:
 *   get:
 *     summary: Get the latest ground truth graph
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully retrieved ground truth
 */
router.get("/ground-truth", async (req: Request, res: Response) => {
  try {
    const groundTruth = await groundTruthBuilder.getLatestGroundTruth();
    
    if (!groundTruth) {
      return res.status(404).json({
        success: false,
        error: "No ground truth found. Please build ground truth first."
      });
    }
    
    res.json({
      success: true,
      groundTruth,
      message: "Ground truth retrieved successfully"
    });
  } catch (error) {
    console.error("Ground truth retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve ground truth",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/ground-truth/versions:
 *   get:
 *     summary: Get all ground truth versions
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully retrieved ground truth versions
 */
router.get("/ground-truth/versions", async (req: Request, res: Response) => {
  try {
    const versions = await groundTruthBuilder.getAllGroundTruthVersions();
    
    res.json({
      success: true,
      versions,
      message: "Ground truth versions retrieved successfully"
    });
  } catch (error) {
    console.error("Ground truth versions retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve ground truth versions",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/process-all:
 *   post:
 *     summary: Run the complete AI pipeline (extract, summarize, build ground truth)
 *     tags: [AI Agents]
 *     responses:
 *       200:
 *         description: Successfully completed full AI pipeline
 */
router.post("/process-all", async (req: Request, res: Response) => {
  try {
    console.log("Starting complete AI pipeline...");
    
    // Step 1: Extract data
    console.log("Step 1: Extracting data...");
    const extractedData = await extractorService.extractAllTables();
    const filepath = await extractorService.saveExtractedData(extractedData);
    
    // Step 2: Generate schema summaries
    console.log("Step 2: Generating schema summaries...");
    const summaries = await schemaSummarizerAgent.processAllTables(extractedData.tables);
    
    // Step 3: Build ground truth
    console.log("Step 3: Building ground truth...");
    const groundTruth = await groundTruthBuilder.buildGroundTruth(extractedData.tables);
    const validation = groundTruthBuilder.validateGroundTruth(groundTruth);
    const groundTruthId = await groundTruthBuilder.saveGroundTruth(groundTruth);
    
    res.json({
      success: true,
      pipeline: {
        extraction: {
          data: extractedData,
          filepath
        },
        summarization: {
          summaries
        },
        groundTruth: {
          graph: groundTruth,
          validation,
          id: groundTruthId
        }
      },
      message: "Complete AI pipeline executed successfully"
    });
  } catch (error) {
    console.error("AI pipeline error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to execute AI pipeline",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai/generate-query:
 *   post:
 *     summary: Generate SAP SQL query from natural language prompt
 *     tags: [AI Agents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language description of the query
 *               maxTables:
 *                 type: number
 *                 description: Maximum number of tables to include
 *               includeExplanation:
 *                 type: boolean
 *                 description: Whether to include explanation
 *               preferredJoinType:
 *                 type: string
 *                 enum: [inner, left, right, full]
 *                 description: Preferred join type
 *               businessContext:
 *                 type: string
 *                 description: Business context for the query
 *     responses:
 *       200:
 *         description: Successfully generated SQL query
 */
router.post("/generate-query", async (req: Request, res: Response) => {
  try {
    console.log("Generating SAP query for prompt:", req.body.prompt);
    
    const result = await sapQueryGenerator.generateSAPQuery(req.body);
    
    res.json({
      success: true,
      data: result,
      message: "SAP query generated successfully"
    });
  } catch (error) {
    console.error("Query generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate SAP query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;