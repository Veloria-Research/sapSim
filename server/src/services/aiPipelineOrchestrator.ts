import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  SAPQueryGenerator,
  SAPQueryRequest,
  SAPQueryResult,
} from "./sapQueryGenerator.js";
import { RelationshipInference } from "./relationshipInference.js";
import { ColumnAnalyzer } from "./columnAnalyzer.js";
import { SchemaSummarizerAgent } from "./schemaSummarizer.js";
import { ValidatorAgent } from "./validatorAgent.js";

export interface PipelineRequest {
  prompt: string;
  context?: {
    businessDomain?: string;
    preferredComplexity?: "simple" | "medium" | "complex";
    includeExplanation?: boolean;
    maxTables?: number;
    outputFormat?: "sql" | "explanation" | "both";
  };
  metadata?: {
    useGroundTruth?: boolean;
    useSchemaSummary?: boolean;
    useTableRelationships?: boolean;
    useColumnMetadata?: boolean;
  };
}

export interface PipelineResult {
  query: SAPQueryResult;
  pipeline: {
    stagesExecuted: string[];
    metadataUsed: {
      groundTruth?: any;
      schemaSummaries?: any[];
      tableRelationships?: any[];
      columnMetadata?: any[];
    };
    aiAnalysis: {
      intentAnalysis: any;
      contextEnrichment: any;
      relationshipMapping: any;
      queryOptimization: any;
    };
    confidence: number;
    processingTime: number;
  };
  recommendations?: {
    alternativeQueries?: string[];
    optimizationSuggestions?: string[];
    dataQualityInsights?: string[];
  };
}

export interface MetadataContext {
  groundTruth: any;
  schemaSummaries: Array<{
    table: string;
    summary: string;
    embedding?: number[];
  }>;
  tableRelationships: Array<{
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    relationshipType: string;
    confidence: number;
    businessRule?: string;
  }>;
  columnMetadata: Array<{
    tableName: string;
    columnName: string;
    semanticType?: string;
    businessContext?: string;
    description?: string;
    sampleValues: any[];
    possibleJoinKeys: any[];
  }>;
}

export class AIPipelineOrchestrator {
  private openai: OpenAI;
  private sapQueryGenerator: SAPQueryGenerator;
  private relationshipInference: RelationshipInference;
  private columnAnalyzer: ColumnAnalyzer;
  private schemaSummarizer: SchemaSummarizerAgent;
  private validator: ValidatorAgent;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize all AI services
    this.sapQueryGenerator = new SAPQueryGenerator(prisma);
    this.relationshipInference = new RelationshipInference(prisma);
    this.columnAnalyzer = new ColumnAnalyzer(prisma);
    this.schemaSummarizer = new SchemaSummarizerAgent(prisma);
    this.validator = new ValidatorAgent(prisma);
  }

  async processQuery(request: PipelineRequest): Promise<PipelineResult> {
    const startTime = Date.now();
    const stagesExecuted: string[] = [];
    const aiAnalysis: any = {};

    try {
      // Stage 1: Intent Analysis and Context Understanding
      stagesExecuted.push("intent_analysis");
      const intentAnalysis = await this.analyzeIntent(request.prompt);
      aiAnalysis.intentAnalysis = intentAnalysis;

      // Stage 2: Metadata Collection and Enrichment
      stagesExecuted.push("metadata_collection");
      const metadataContext = await this.collectMetadataContext(
        intentAnalysis.relevantTables || [],
        request.metadata
      );

      // Stage 3: Context Enrichment using AI
      stagesExecuted.push("context_enrichment");
      const enrichedContext = await this.enrichContextWithAI(
        request.prompt,
        intentAnalysis,
        metadataContext
      );
      aiAnalysis.contextEnrichment = enrichedContext;

      // Stage 4: Relationship Mapping and Join Strategy
      stagesExecuted.push("relationship_mapping");
      const relationshipMapping = await this.mapRelationships(
        enrichedContext.suggestedTables || [],
        metadataContext
      );
      aiAnalysis.relationshipMapping = relationshipMapping;

      // Stage 5: Query Generation with Enhanced Context
      stagesExecuted.push("query_generation");
      const enhancedRequest: SAPQueryRequest = {
        prompt: request.prompt,
        maxTables: request.context?.maxTables || 5,
        includeExplanation: request.context?.includeExplanation ?? true,
        businessContext: this.buildBusinessContext(
          enrichedContext,
          metadataContext
        ),
        autoSave: false, // Disable auto-save to prevent duplication - AI pipeline handles saving manually
      };

      const queryResult =
        await this.sapQueryGenerator.generateSAPQuery(enhancedRequest);

      // Stage 6: Query Optimization and Validation
      stagesExecuted.push("optimization_validation");
      const optimizedQuery = await this.optimizeAndValidateQuery(
        queryResult,
        metadataContext,
        relationshipMapping
      );
      aiAnalysis.queryOptimization = optimizedQuery.optimizationDetails;

      // Stage 7: Generate Recommendations
      stagesExecuted.push("recommendations");
      const recommendations = await this.generateRecommendations(
        request.prompt,
        optimizedQuery.query,
        metadataContext
      );

      const processingTime = Date.now() - startTime;

      return {
        query: optimizedQuery.query,
        pipeline: {
          stagesExecuted,
          metadataUsed: {
            groundTruth: metadataContext.groundTruth,
            schemaSummaries: metadataContext.schemaSummaries,
            tableRelationships: metadataContext.tableRelationships,
            columnMetadata: metadataContext.columnMetadata,
          },
          aiAnalysis,
          confidence: this.calculateOverallConfidence(
            optimizedQuery.query,
            aiAnalysis
          ),
          processingTime,
        },
        recommendations,
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      throw new Error(
        `AI Pipeline failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async analyzeIntent(prompt: string): Promise<{
    queryType: string;
    businessDomain: string;
    entities: string[];
    operations: string[];
    relevantTables: string[];
    complexity: "simple" | "medium" | "complex";
    confidence: number;
  }> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an expert SAP business analyst. Analyze the user's query intent and extract:
          1. Query type (reporting, analysis, lookup, aggregation, etc.)
          2. Business domain (sales, finance, materials, customers, etc.)
          3. Key entities mentioned
          4. Required operations (join, filter, aggregate, etc.)
          5. Relevant SAP tables (VBAK, VBAP, MARA, KNA1, etc.)
          6. Query complexity level
          
          Respond in JSON format with high confidence scores.`,
        },
        {
          role: "user",
          content: `Analyze this query: "${prompt}"`,
        },
      ],
      temperature: 0.1,
    });

    try {
      return JSON.parse(completion.choices[0].message.content || "{}");
    } catch {
      return {
        queryType: "general",
        businessDomain: "unknown",
        entities: [],
        operations: ["select"],
        relevantTables: ["VBAK", "VBAP", "MARA", "KNA1"],
        complexity: "medium" as const,
        confidence: 0.5,
      };
    }
  }

  private async collectMetadataContext(
    relevantTables: string[] = [],
    metadataOptions?: PipelineRequest["metadata"]
  ): Promise<MetadataContext> {
    const context: MetadataContext = {
      groundTruth: null,
      schemaSummaries: [],
      tableRelationships: [],
      columnMetadata: [],
    };

    // Collect Ground Truth if requested
    if (metadataOptions?.useGroundTruth !== false) {
      const latestGroundTruth = await this.prisma.groundTruth.findFirst({
        orderBy: { createdAt: "desc" },
      });
      context.groundTruth = latestGroundTruth;
    }

    // Collect Schema Summaries
    if (metadataOptions?.useSchemaSummary !== false) {
      context.schemaSummaries = await this.prisma.schemaSummary.findMany({
        where:
          relevantTables.length > 0
            ? {
                table: { in: relevantTables },
              }
            : undefined,
        select: {
          table: true,
          summary: true,
        },
      });
    }

    // Collect Table Relationships
    if (metadataOptions?.useTableRelationships !== false) {
      const relationships = await this.prisma.tableRelationship.findMany({
        where:
          relevantTables.length > 0
            ? {
                OR: [
                  { leftTable: { in: relevantTables } },
                  { rightTable: { in: relevantTables } },
                ],
              }
            : undefined,
      });

      context.tableRelationships = relationships.map((r) => ({
        leftTable: r.leftTable,
        leftColumn: r.leftColumn,
        rightTable: r.rightTable,
        rightColumn: r.rightColumn,
        relationshipType: r.relationshipType,
        confidence: r.confidence,
        businessRule: r.businessRule || undefined,
      }));
    }

    // Collect Column Metadata
    if (metadataOptions?.useColumnMetadata !== false) {
      const columns = await this.prisma.columnMetadata.findMany({
        where:
          relevantTables.length > 0
            ? {
                tableName: { in: relevantTables },
              }
            : undefined,
        select: {
          tableName: true,
          columnName: true,
          semanticType: true,
          businessContext: true,
          description: true,
          sampleValues: true,
          possibleJoinKeys: true,
        },
      });

      context.columnMetadata = columns.map((c) => ({
        tableName: c.tableName,
        columnName: c.columnName,
        semanticType: c.semanticType || undefined,
        businessContext: c.businessContext || undefined,
        description: c.description || undefined,
        sampleValues: Array.isArray(c.sampleValues) ? c.sampleValues : [],
        possibleJoinKeys: Array.isArray(c.possibleJoinKeys)
          ? c.possibleJoinKeys
          : [],
      }));
    }

    return context;
  }

  private async enrichContextWithAI(
    prompt: string,
    intentAnalysis: any,
    metadataContext: MetadataContext
  ): Promise<{
    suggestedTables: string[];
    recommendedJoins: any[];
    businessLogic: string;
    optimizationHints: string[];
  }> {
    const contextSummary = this.buildContextSummary(metadataContext);

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an expert SAP data architect. Using the provided metadata context, enrich the query understanding with:
          1. Optimal table selection based on business logic
          2. Recommended join strategies
          3. Business logic interpretation
          4. Query optimization hints
          
          Consider the schema summaries, table relationships, and column metadata provided.`,
        },
        {
          role: "user",
          content: `
          Original Query: "${prompt}"
          Intent Analysis: ${JSON.stringify(intentAnalysis)}
          Metadata Context: ${contextSummary}
          
          Provide enriched context in JSON format.`,
        },
      ],
      temperature: 0.2,
    });

    try {
      return JSON.parse(completion.choices[0].message.content || "{}");
    } catch {
      return {
        suggestedTables: intentAnalysis.relevantTables || [],
        recommendedJoins: [],
        businessLogic: "Standard SAP business logic applies",
        optimizationHints: [],
      };
    }
  }

  private async mapRelationships(
    suggestedTables: string[],
    metadataContext: MetadataContext
  ): Promise<{
    joinPaths: any[];
    relationshipConfidence: number;
    alternativePaths: any[];
  }> {
    // Use existing relationship inference service
    const relationships =
      await this.relationshipInference.getRelationshipsForTables(
        suggestedTables
      );

    // AI-enhanced relationship mapping
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in SAP table relationships. Analyze the provided relationships and suggest optimal join paths.",
        },
        {
          role: "user",
          content: `
          Tables: ${suggestedTables.join(", ")}
          Available Relationships: ${JSON.stringify(relationships)}
          Column Metadata: ${JSON.stringify(metadataContext.columnMetadata)}
          
          Suggest optimal join paths in JSON format.`,
        },
      ],
      temperature: 0.1,
    });

    try {
      return JSON.parse(completion.choices[0].message.content || "{}");
    } catch {
      return {
        joinPaths: relationships.map((r) => ({
          from: `${r.leftTable}.${r.leftColumn}`,
          to: `${r.rightTable}.${r.rightColumn}`,
          type: r.joinType || "inner",
        })),
        relationshipConfidence: 0.8,
        alternativePaths: [],
      };
    }
  }

  private buildBusinessContext(
    enrichedContext: any,
    metadataContext: MetadataContext
  ): string {
    const schemaSummaries = metadataContext.schemaSummaries
      .map((s) => `${s.table}: ${s.summary}`)
      .join("\n");

    const relationships = metadataContext.tableRelationships
      .map(
        (r) =>
          `${r.leftTable}.${r.leftColumn} -> ${r.rightTable}.${r.rightColumn} (${r.relationshipType})`
      )
      .join("\n");

    return `
Business Context:
${enrichedContext.businessLogic}

Schema Summaries:
${schemaSummaries}

Key Relationships:
${relationships}

Optimization Hints:
${enrichedContext.optimizationHints?.join("\n") || "None"}
    `.trim();
  }

  private async optimizeAndValidateQuery(
    queryResult: SAPQueryResult,
    metadataContext: MetadataContext,
    relationshipMapping: any
  ): Promise<{
    query: SAPQueryResult;
    optimizationDetails: any;
  }> {
    // Validate using existing validator
    const groundTruth = metadataContext.groundTruth?.graph || null;
    const validationResult = await this.validator.validateQuery(
      queryResult.sql,
      groundTruth
    );

    // AI-powered optimization
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "You are an expert SQL optimizer for SAP systems. Analyze and suggest optimizations for the provided query.",
        },
        {
          role: "user",
          content: `
          Query: ${queryResult.sql}
          Validation Result: ${JSON.stringify(validationResult)}
          Available Relationships: ${JSON.stringify(relationshipMapping)}
          
          Suggest optimizations in JSON format.`,
        },
      ],
      temperature: 0.1,
    });

    let optimizationDetails = {};
    try {
      optimizationDetails = JSON.parse(
        completion.choices[0].message.content || "{}"
      );
    } catch {
      optimizationDetails = { suggestions: [], confidence: 0.5 };
    }

    // Apply optimizations if validation passed
    const optimizedQuery = validationResult.isValid
      ? queryResult
      : {
          ...queryResult,
          validationStatus: "invalid" as const,
          validationErrors: validationResult.errors,
        };

    return {
      query: optimizedQuery,
      optimizationDetails,
    };
  }

  private async generateRecommendations(
    originalPrompt: string,
    queryResult: SAPQueryResult,
    metadataContext: MetadataContext
  ): Promise<{
    alternativeQueries?: string[];
    optimizationSuggestions?: string[];
    dataQualityInsights?: string[];
  }> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "Generate helpful recommendations for the user based on their query and the generated SQL.",
        },
        {
          role: "user",
          content: `
          Original Request: "${originalPrompt}"
          Generated Query: ${queryResult.sql}
          Metadata Available: ${JSON.stringify(metadataContext.schemaSummaries)}
          
          Provide recommendations in JSON format.`,
        },
      ],
      temperature: 0.3,
    });

    try {
      return JSON.parse(completion.choices[0].message.content || "{}");
    } catch {
      return {
        alternativeQueries: [],
        optimizationSuggestions: [],
        dataQualityInsights: [],
      };
    }
  }

  private buildContextSummary(metadataContext: MetadataContext): string {
    return `
Schema Summaries: ${metadataContext.schemaSummaries.length} tables
Table Relationships: ${metadataContext.tableRelationships.length} relationships  
Column Metadata: ${metadataContext.columnMetadata.length} columns analyzed
Ground Truth: ${metadataContext.groundTruth ? "Available" : "Not available"}
    `.trim();
  }

  private calculateOverallConfidence(
    queryResult: SAPQueryResult,
    aiAnalysis: any
  ): number {
    const factors = [
      queryResult.confidence,
      aiAnalysis.intentAnalysis?.confidence || 0.5,
      aiAnalysis.relationshipMapping?.relationshipConfidence || 0.5,
      queryResult.validationStatus === "valid" ? 1.0 : 0.3,
    ];

    return factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  }

  // Utility method to process all metadata and prepare the system
  async initializePipeline(): Promise<{
    tablesAnalyzed: number;
    relationshipsInferred: number;
    schemasProcessed: number;
    status: string;
  }> {
    try {
      console.log("Initializing AI Pipeline...");

      // Extract and analyze all data
      const extractorService = new (
        await import("./extractor.js")
      ).ExtractorService(this.prisma);
      const extractedData = await extractorService.extractAllTables();

      // Process schema summaries
      const summaries = await this.schemaSummarizer.processAllTables(
        extractedData.tables
      );

      // Analyze columns
      const columnAnalyses = await this.columnAnalyzer.analyzeAllColumns(
        extractedData.tables
      );
      await this.columnAnalyzer.saveColumnAnalyses(columnAnalyses);

      // Infer relationships
      const relationships =
        await this.relationshipInference.inferAllRelationships();

      return {
        tablesAnalyzed: extractedData.tables.length,
        relationshipsInferred: relationships.length,
        schemasProcessed: summaries.length,
        status: "Pipeline initialized successfully",
      };
    } catch (error) {
      console.error("Pipeline initialization error:", error);
      throw error;
    }
  }
}
