import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { SAPQueryGenerator } from "../services/sapQueryGenerator.js";

const router = Router();
const prisma = new PrismaClient();
const sapQueryGenerator = new SAPQueryGenerator(prisma);

/**
 * @swagger
 * /api/sap-query/generate:
 *   post:
 *     summary: Generate complex SAP SQL queries from natural language prompts
 *     tags: [SAP Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language description of the SAP query
 *                 example: "Show me sales order data with material information for customer 5000001234"
 *               maxTables:
 *                 type: integer
 *                 description: Maximum number of tables to include in the query
 *                 default: 5
 *               includeExplanation:
 *                 type: boolean
 *                 description: Whether to include detailed explanation
 *                 default: true
 *               preferredJoinType:
 *                 type: string
 *                 enum: [inner, left, right, full]
 *                 description: Preferred type of JOIN to use
 *                 default: inner
 *               businessContext:
 *                 type: string
 *                 description: Additional business context for the query
 *     responses:
 *       200:
 *         description: Successfully generated SAP SQL query
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sql:
 *                       type: string
 *                       description: Generated SQL query
 *                     confidence:
 *                       type: number
 *                       description: Confidence score (0.0-1.0)
 *                     explanation:
 *                       type: string
 *                       description: Technical explanation of the query
 *                     businessLogic:
 *                       type: string
 *                       description: Business logic explanation
 *                     tablesUsed:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of SAP tables used
 *                     joinTypes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Types of JOINs used
 *                     complexity:
 *                       type: string
 *                       enum: [simple, medium, complex]
 *                     sapModules:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: SAP modules involved
 *                     validationStatus:
 *                       type: string
 *                       enum: [valid, invalid, warning]
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { prompt, maxTables, includeExplanation, preferredJoinType, businessContext } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string"
      });
    }

    console.log(`Generating SAP query for prompt: "${prompt}"`);
    
    const result = await sapQueryGenerator.generateSAPQuery({
      prompt,
      maxTables: maxTables || 5,
      includeExplanation: includeExplanation !== false,
      preferredJoinType: preferredJoinType || 'inner',
      businessContext
    });

    res.json({
      success: true,
      data: result,
      message: "SAP query generated successfully"
    });
  } catch (error) {
    console.error("SAP query generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate SAP query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/sap-query/execute:
 *   post:
 *     summary: Execute a generated SAP SQL query
 *     tags: [SAP Query Processing]
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
 *                 type: integer
 *                 description: Maximum number of rows to return
 *                 default: 100
 *     responses:
 *       200:
 *         description: Query executed successfully
 *       400:
 *         description: Invalid SQL query
 *       500:
 *         description: Query execution failed
 */
router.post("/execute", async (req: Request, res: Response) => {
  try {
    const { sql, limit } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        success: false,
        error: "SQL query is required and must be a string"
      });
    }

    // Add LIMIT clause if not present and limit is specified
    let finalSql = sql.trim();
    if (limit && !finalSql.toUpperCase().includes('LIMIT')) {
      finalSql += ` LIMIT ${limit}`;
    }

    console.log(`Executing SAP query: ${finalSql.substring(0, 100)}...`);
    
    const result = await sapQueryGenerator.executeQuery(finalSql);

    res.json({
      success: true,
      data: {
        results: result.results,
        executionTime: result.executionTime,
        rowCount: result.rowCount,
        sql: finalSql
      },
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
 * /api/sap-query/generate-and-execute:
 *   post:
 *     summary: Generate and execute SAP SQL query in one step
 *     tags: [SAP Query Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language description of the SAP query
 *               limit:
 *                 type: integer
 *                 description: Maximum number of rows to return
 *                 default: 100
 *               businessContext:
 *                 type: string
 *                 description: Additional business context
 *     responses:
 *       200:
 *         description: Query generated and executed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Generation or execution failed
 */
router.post("/generate-and-execute", async (req: Request, res: Response) => {
  try {
    const { prompt, limit, businessContext } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string"
      });
    }

    console.log(`Generating and executing SAP query for: "${prompt}"`);
    
    // Step 1: Generate the query
    const queryResult = await sapQueryGenerator.generateSAPQuery({
      prompt,
      includeExplanation: true,
      businessContext
    });

    // Step 2: Execute the query if it's valid
    if (queryResult.validationStatus === 'invalid') {
      return res.status(400).json({
        success: false,
        error: "Generated query is invalid",
        details: queryResult.validationErrors,
        generatedQuery: queryResult
      });
    }

    // Add LIMIT clause if specified
    let finalSql = queryResult.sql.trim();
    if (limit && !finalSql.toUpperCase().includes('LIMIT')) {
      finalSql += ` LIMIT ${limit}`;
    }

    const executionResult = await sapQueryGenerator.executeQuery(finalSql);

    res.json({
      success: true,
      data: {
        query: queryResult,
        execution: {
          results: executionResult.results,
          executionTime: executionResult.executionTime,
          rowCount: executionResult.rowCount,
          sql: finalSql
        }
      },
      message: "Query generated and executed successfully"
    });
  } catch (error) {
    console.error("Generate and execute error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate and execute query",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/sap-query/examples:
 *   get:
 *     summary: Get example SAP queries and prompts
 *     tags: [SAP Query Processing]
 *     responses:
 *       200:
 *         description: List of example queries
 */
router.get("/examples", async (req: Request, res: Response) => {
  try {
    const examples = [
      {
        prompt: "Show me sales order data with material information for a specific sales order",
        expectedSQL: `SELECT 
    VBAK.VBELN AS Sales_Order,
    VBAK.AUART AS Sales_Doc_Type,
    VBAK.ERDAT AS Created_On,
    VBAP.POSNR AS Item_Number,
    VBAP.MATNR AS Material_Number,
    MARA.MTART AS Material_Type,
    MARA.MATKL AS Material_Group,
    MARA.MEINS AS Base_Unit
FROM VBAK
INNER JOIN VBAP ON VBAK.VBELN = VBAP.VBELN
INNER JOIN MARA ON VBAP.MATNR = MARA.MATNR
WHERE VBAK.VBELN = '5000001234';`,
        description: "Complex JOIN query across Sales and Materials Management modules",
        complexity: "medium",
        sapModules: ["SD", "MM"]
      },
      {
        prompt: "Get customer information with their sales orders",
        expectedSQL: `SELECT 
    KNA1.KUNNR AS Customer_Number,
    KNA1.NAME1 AS Customer_Name,
    KNA1.ORT01 AS City,
    VBAK.VBELN AS Sales_Order,
    VBAK.ERDAT AS Order_Date
FROM KNA1
INNER JOIN VBAK ON KNA1.KUNNR = VBAK.KUNNR;`,
        description: "Customer master data with sales documents",
        complexity: "simple",
        sapModules: ["SD"]
      },
      {
        prompt: "Show material master data with sales information",
        expectedSQL: `SELECT 
    MARA.MATNR AS Material_Number,
    MARA.MTART AS Material_Type,
    MARA.MATKL AS Material_Group,
    VBAP.VBELN AS Sales_Order,
    VBAP.KWMENG AS Order_Quantity
FROM MARA
LEFT JOIN VBAP ON MARA.MATNR = VBAP.MATNR;`,
        description: "Material master with optional sales data",
        complexity: "simple",
        sapModules: ["MM", "SD"]
      }
    ];

    res.json({
      success: true,
      data: examples,
      message: "Example SAP queries retrieved successfully"
    });
  } catch (error) {
    console.error("Error retrieving examples:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve examples",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/sap-query/history:
 *   get:
 *     summary: Get query generation history
 *     tags: [SAP Query Processing]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of queries to return
 *     responses:
 *       200:
 *         description: Query history retrieved successfully
 */
router.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const history = await prisma.generatedQuery.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        prompt: true,
        sql: true,
        confidence: true,
        complexity: true,
        tablesUsed: true,
        validationStatus: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      data: history,
      message: "Query history retrieved successfully"
    });
  } catch (error) {
    console.error("Error retrieving query history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve query history",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;