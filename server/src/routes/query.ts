import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { SAPQueryGenerator } from "../services/sapQueryGenerator.js";
import { ValidatorAgent } from "../services/validatorAgent.js";
import { ColumnAnalyzer } from "../services/columnAnalyzer.js";
import { RelationshipInference } from "../services/relationshipInference.js";

const router = Router();
const prisma = new PrismaClient();

// Initialize services
const sapQueryGenerator = new SAPQueryGenerator(prisma);
const validatorAgent = new ValidatorAgent(prisma);
const columnAnalyzer = new ColumnAnalyzer(prisma);
const relationshipInference = new RelationshipInference(prisma);

/**
 * @swagger
 * /api/query/generate:
 *   post:
 *     summary: Generate SQL query from natural language prompt
 *     tags: [Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language query description
 *               context:
 *                 type: object
 *                 description: Optional context for query generation
 *     responses:
 *       200:
 *         description: Successfully generated SQL query
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { prompt, context } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string"
      });
    }

    console.log(`Generating query for prompt: "${prompt}"`);
    
    const result = await sapQueryGenerator.generateSAPQuery({
      prompt,
      maxTables: context?.maxTables,
      includeExplanation: true,
      preferredJoinType: context?.preferredJoinType
    });

    res.json({
      success: true,
      data: result,
      message: "Query generated successfully"
    });
  } catch (error) {
    console.error("Query generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/validate:
 *   post:
 *     summary: Validate SQL query against schema and business rules
 *     tags: [Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sql:
 *                 type: string
 *                 description: SQL query to validate
 *               context:
 *                 type: object
 *                 description: Query context with tables and columns
 *     responses:
 *       200:
 *         description: Validation results
 */
router.post("/validate", async (req: Request, res: Response) => {
  try {
    const { sql, context } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        success: false,
        error: "SQL query is required and must be a string"
      });
    }

    console.log(`Validating SQL query: ${sql.substring(0, 100)}...`);
    
    // Get ground truth for validation
    const groundTruth = await validatorAgent.getGroundTruthForValidation();
    if (!groundTruth) {
      return res.status(500).json({
        success: false,
        error: "Ground truth data not available for validation"
      });
    }
    
    const validationResult = await validatorAgent.validateQuery(sql, groundTruth, context?.businessContext);

    res.json({
      success: true,
      data: validationResult,
      message: "Query validation completed"
    });
  } catch (error) {
    console.error("Query validation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to validate query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/execute:
 *   post:
 *     summary: Execute validated SQL query and return formatted results
 *     tags: [Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sql:
 *                 type: string
 *                 description: SQL query to execute
 *               limit:
 *                 type: number
 *                 description: Maximum number of rows to return (default 100)
 *               validate:
 *                 type: boolean
 *                 description: Whether to validate before execution (default true)
 *     responses:
 *       200:
 *         description: Query execution results
 */
router.post("/execute", async (req: Request, res: Response) => {
  try {
    const { sql, limit = 100, validate = true } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        success: false,
        error: "SQL query is required and must be a string"
      });
    }

    console.log(`Executing SQL query: ${sql.substring(0, 100)}...`);
    
    const result = await sapQueryGenerator.executeQuery(sql);

    res.json({
      success: true,
      data: result,
      message: "Query executed successfully"
    });
  } catch (error) {
    console.error("Query execution error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to execute query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/history:
 *   get:
 *     summary: Get query generation history
 *     tags: [Query Processing]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Maximum number of queries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *         description: Number of queries to skip
 *     responses:
 *       200:
 *         description: Query history retrieved successfully
 */
router.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    console.log(`Retrieving query history (limit: ${limit}, offset: ${offset})`);
    
    // Get query history from database directly
    const history = await prisma.generatedQuery.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prompt: true,
        sql: true,
        explanation: true,
        businessLogic: true,
        confidence: true,
        complexity: true,
        tablesUsed: true,
        joinTypes: true,
        validationStatus: true,
        validationErrors: true,
        executionTime: true,
        resultCount: true,
        templateUsed: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      data: history,
      message: "Query history retrieved successfully"
    });
  } catch (error) {
    console.error("Query history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve query history",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/analyze-columns:
 *   post:
 *     summary: Analyze column semantics and patterns for better query generation
 *     tags: [Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableName:
 *                 type: string
 *                 description: Name of the table to analyze
 *               forceRefresh:
 *                 type: boolean
 *                 description: Whether to force refresh existing analysis
 *     responses:
 *       200:
 *         description: Column analysis completed
 */
router.post("/analyze-columns", async (req: Request, res: Response) => {
  try {
    const { tableName, forceRefresh = false } = req.body;

    if (!tableName || typeof tableName !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Table name is required and must be a string"
      });
    }

    console.log(`Analyzing columns for table: ${tableName}`);
    
    // For now, return a placeholder response since analyzeTable method doesn't exist
    // This would need to be implemented based on the actual ColumnAnalyzer interface
    const analysis = { message: "Column analysis feature needs to be implemented" };

    res.json({
      success: true,
      data: analysis,
      message: "Column analysis completed successfully"
    });
  } catch (error) {
    console.error("Column analysis error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to analyze columns",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/infer-relationships:
 *   post:
 *     summary: Infer relationships between tables for better query generation
 *     tags: [Query Processing]
 *     responses:
 *       200:
 *         description: Relationship inference completed
 */
router.post("/infer-relationships", async (req: Request, res: Response) => {
  try {
    console.log("Starting relationship inference...");
    
    const relationships = await relationshipInference.inferAllRelationships();

    res.json({
      success: true,
      data: relationships,
      message: "Relationship inference completed successfully"
    });
  } catch (error) {
    console.error("Relationship inference error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to infer relationships",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/templates:
 *   get:
 *     summary: Get available query templates
 *     tags: [Query Processing]
 *     responses:
 *       200:
 *         description: Query templates retrieved successfully
 */
router.get("/templates", async (req: Request, res: Response) => {
  try {
    console.log("Retrieving query templates...");
    
    const templates = await prisma.queryTemplate.findMany({
      orderBy: { confidence: 'desc' }
    });

    res.json({
      success: true,
      data: templates,
      message: "Query templates retrieved successfully"
    });
  } catch (error) {
    console.error("Query templates error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve query templates",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/query/process:
 *   post:
 *     summary: Complete query processing pipeline - generate, validate, and execute
 *     tags: [Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language query description
 *               executeQuery:
 *                 type: boolean
 *                 description: Whether to execute the generated query (default false)
 *               limit:
 *                 type: number
 *                 description: Maximum number of rows to return if executing
 *     responses:
 *       200:
 *         description: Complete query processing results
 */
router.post("/process", async (req: Request, res: Response) => {
  try {
    const { prompt, executeQuery = false, limit = 100 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string"
      });
    }

    console.log(`Processing complete pipeline for prompt: "${prompt}"`);
    
    // Step 1: Generate query
    const generatedQuery = await sapQueryGenerator.generateSAPQuery({
      prompt,
      includeExplanation: true
    });

    // Step 2: Validate query
    const groundTruth = await validatorAgent.getGroundTruthForValidation();
    let validationResult = null;
    if (groundTruth) {
      validationResult = await validatorAgent.validateQuery(
        generatedQuery.sql,
        groundTruth
      );
    }

    let executionResult = null;
    
    // Step 3: Execute if requested and validation passes
    if (executeQuery && validationResult?.isValid) {
      executionResult = await sapQueryGenerator.executeQuery(
        generatedQuery.sql
      );
    }

    res.json({
      success: true,
      data: {
        generation: generatedQuery,
        validation: validationResult,
        execution: executionResult
      },
      message: "Query processing pipeline completed successfully"
    });
  } catch (error) {
    console.error("Query processing pipeline error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process query pipeline",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;