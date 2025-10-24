import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AIPipelineOrchestrator, PipelineRequest } from "../services/aiPipelineOrchestrator.js";

const router = Router();
const prisma = new PrismaClient();
const aiPipeline = new AIPipelineOrchestrator(prisma);

/**
 * @swagger
 * /api/ai-pipeline/query:
 *   post:
 *     summary: Generate SQL queries using comprehensive AI pipeline with all metadata
 *     tags: [AI Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Natural language query description
 *                 example: "Show me all sales orders for customer 500000 with material details"
 *               context:
 *                 type: object
 *                 properties:
 *                   businessDomain:
 *                     type: string
 *                     example: "sales"
 *                   preferredComplexity:
 *                     type: string
 *                     enum: [simple, medium, complex]
 *                     example: "medium"
 *                   includeExplanation:
 *                     type: boolean
 *                     example: true
 *                   maxTables:
 *                     type: integer
 *                     example: 5
 *                   outputFormat:
 *                     type: string
 *                     enum: [sql, explanation, both]
 *                     example: "both"
 *               metadata:
 *                 type: object
 *                 properties:
 *                   useGroundTruth:
 *                     type: boolean
 *                     example: true
 *                   useSchemaSummary:
 *                     type: boolean
 *                     example: true
 *                   useTableRelationships:
 *                     type: boolean
 *                     example: true
 *                   useColumnMetadata:
 *                     type: boolean
 *                     example: true
 *     responses:
 *       200:
 *         description: Successfully generated query with comprehensive AI analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: object
 *                   properties:
 *                     query:
 *                       type: object
 *                       properties:
 *                         sql:
 *                           type: string
 *                         confidence:
 *                           type: number
 *                         explanation:
 *                           type: string
 *                         businessLogic:
 *                           type: string
 *                         tablesUsed:
 *                           type: array
 *                           items:
 *                             type: string
 *                         complexity:
 *                           type: string
 *                         validationStatus:
 *                           type: string
 *                     pipeline:
 *                       type: object
 *                       properties:
 *                         stagesExecuted:
 *                           type: array
 *                           items:
 *                             type: string
 *                         confidence:
 *                           type: number
 *                         processingTime:
 *                           type: number
 *                     recommendations:
 *                       type: object
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: AI pipeline processing error
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const { prompt, context, metadata } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string"
      });
    }

    const pipelineRequest: PipelineRequest = {
      prompt,
      context: {
        businessDomain: context?.businessDomain,
        preferredComplexity: context?.preferredComplexity || 'medium',
        includeExplanation: context?.includeExplanation ?? true,
        maxTables: context?.maxTables || 5,
        outputFormat: context?.outputFormat || 'both'
      },
      metadata: {
        useGroundTruth: metadata?.useGroundTruth ?? true,
        useSchemaSummary: metadata?.useSchemaSummary ?? true,
        useTableRelationships: metadata?.useTableRelationships ?? true,
        useColumnMetadata: metadata?.useColumnMetadata ?? true
      }
    };

    console.log(`Processing AI pipeline query: "${prompt}"`);
    const result = await aiPipeline.processQuery(pipelineRequest);

    // Save the generated query to database for tracking
    if (result.query.sql) {
      await prisma.generatedQuery.create({
        data: {
          prompt,
          sql: result.query.sql,
          confidence: result.pipeline.confidence,
          tablesUsed: result.query.tablesUsed,
          joinTypes: result.query.joinTypes || [],
          complexity: result.query.complexity,
          validationStatus: result.query.validationStatus,
          validationErrors: result.query.validationErrors || []
        }
      });
    }

    res.json({
      success: true,
      result,
      message: "Query generated successfully using AI pipeline"
    });

  } catch (error) {
    console.error("AI Pipeline query error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process query through AI pipeline",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai-pipeline/initialize:
 *   post:
 *     summary: Initialize the AI pipeline by processing all metadata
 *     tags: [AI Pipeline]
 *     responses:
 *       200:
 *         description: Successfully initialized AI pipeline
 */
router.post("/initialize", async (req: Request, res: Response) => {
  try {
    console.log("Initializing AI Pipeline...");
    const initResult = await aiPipeline.initializePipeline();
    
    res.json({
      success: true,
      result: initResult,
      message: "AI Pipeline initialized successfully"
    });
  } catch (error) {
    console.error("AI Pipeline initialization error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to initialize AI pipeline",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai-pipeline/batch-query:
 *   post:
 *     summary: Process multiple queries in batch using AI pipeline
 *     tags: [AI Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - queries
 *             properties:
 *               queries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     prompt:
 *                       type: string
 *                     context:
 *                       type: object
 *               sharedContext:
 *                 type: object
 *                 description: Context shared across all queries
 *     responses:
 *       200:
 *         description: Successfully processed batch queries
 */
router.post("/batch-query", async (req: Request, res: Response) => {
  try {
    const { queries, sharedContext } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Queries array is required and must not be empty"
      });
    }

    const results = [];
    const startTime = Date.now();

    for (const query of queries) {
      if (!query.prompt) {
        results.push({
          id: query.id || 'unknown',
          success: false,
          error: "Prompt is required"
        });
        continue;
      }

      try {
        const pipelineRequest: PipelineRequest = {
          prompt: query.prompt,
          context: { ...sharedContext, ...query.context },
          metadata: {
            useGroundTruth: true,
            useSchemaSummary: true,
            useTableRelationships: true,
            useColumnMetadata: true
          }
        };

        const result = await aiPipeline.processQuery(pipelineRequest);
        
        results.push({
          id: query.id || `query_${results.length + 1}`,
          success: true,
          result
        });

      } catch (error) {
        results.push({
          id: query.id || `query_${results.length + 1}`,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    const totalTime = Date.now() - startTime;

    res.json({
      success: true,
      results,
      summary: {
        totalQueries: queries.length,
        successfulQueries: results.filter(r => r.success).length,
        failedQueries: results.filter(r => !r.success).length,
        totalProcessingTime: totalTime
      },
      message: "Batch queries processed"
    });

  } catch (error) {
    console.error("Batch query processing error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process batch queries",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai-pipeline/analytics:
 *   get:
 *     summary: Get analytics about AI pipeline performance and usage
 *     tags: [AI Pipeline]
 *     responses:
 *       200:
 *         description: Successfully retrieved analytics
 */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const [
      totalQueries,
      validQueries,
      averageConfidence,
      complexityDistribution,
      recentQueries,
      topTables
    ] = await Promise.all([
      prisma.generatedQuery.count(),
      prisma.generatedQuery.count({ where: { validationStatus: 'valid' } }),
      prisma.generatedQuery.aggregate({ _avg: { confidence: true } }),
      prisma.generatedQuery.groupBy({
        by: ['complexity'],
        _count: { complexity: true }
      }),
      prisma.generatedQuery.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          prompt: true,
          confidence: true,
          complexity: true,
          validationStatus: true,
          createdAt: true
        }
      }),
      prisma.generatedQuery.findMany({
        select: { tablesUsed: true }
      }).then(queries => {
        const tableCount: Record<string, number> = {};
        queries.forEach(q => {
          if (Array.isArray(q.tablesUsed)) {
            q.tablesUsed.forEach((table: any) => {
              const tableName = typeof table === 'string' ? table : String(table);
              tableCount[tableName] = (tableCount[tableName] || 0) + 1;
            });
          }
        });
        return Object.entries(tableCount)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([table, count]) => ({ table, count }));
      })
    ]);

    res.json({
      success: true,
      analytics: {
        overview: {
          totalQueries,
          validQueries,
          validationRate: totalQueries > 0 ? (validQueries / totalQueries) * 100 : 0,
          averageConfidence: averageConfidence._avg.confidence || 0
        },
        complexity: complexityDistribution.reduce((acc, item) => {
          acc[item.complexity] = item._count.complexity;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: recentQueries,
        popularTables: topTables
      },
      message: "Analytics retrieved successfully"
    });

  } catch (error) {
    console.error("Analytics retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve analytics",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @swagger
 * /api/ai-pipeline/metadata-status:
 *   get:
 *     summary: Get status of all metadata tables used by AI pipeline
 *     tags: [AI Pipeline]
 *     responses:
 *       200:
 *         description: Successfully retrieved metadata status
 */
router.get("/metadata-status", async (req: Request, res: Response) => {
  try {
    const [
      groundTruthCount,
      schemaSummaryCount,
      tableRelationshipCount,
      columnMetadataCount,
      latestGroundTruth,
      tablesCovered
    ] = await Promise.all([
      prisma.groundTruth.count(),
      prisma.schemaSummary.count(),
      prisma.tableRelationship.count(),
      prisma.columnMetadata.count(),
      prisma.groundTruth.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { version: true, createdAt: true }
      }),
      prisma.schemaSummary.findMany({
        select: { table: true },
        distinct: ['table']
      })
    ]);

    res.json({
      success: true,
      metadata: {
        groundTruth: {
          count: groundTruthCount,
          latest: latestGroundTruth
        },
        schemaSummary: {
          count: schemaSummaryCount,
          tablesCovered: tablesCovered.length
        },
        tableRelationships: {
          count: tableRelationshipCount
        },
        columnMetadata: {
          count: columnMetadataCount
        },
        coverage: {
          tablesWithSummaries: tablesCovered.map(t => t.table)
        }
      },
      message: "Metadata status retrieved successfully"
    });

  } catch (error) {
    console.error("Metadata status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve metadata status",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;