import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { ValidatorAgent, ValidationResult } from "./validatorAgent.js";
import { GroundTruthBuilder } from "./groundTruthBuilder.js";

export interface SAPQueryRequest {
  prompt: string;
  maxTables?: number;
  includeExplanation?: boolean;
  preferredJoinType?: "inner" | "left" | "right" | "full";
  businessContext?: string;
  autoSave?: boolean; // Controls whether to automatically save the query to database
}

export interface SAPQueryResult {
  sql: string;
  confidence: number;
  explanation: string;
  businessLogic: string;
  tablesUsed: string[];
  joinTypes: string[];
  complexity: "simple" | "medium" | "complex";
  sapModules: string[];
  validationStatus: "valid" | "invalid" | "warning";
  validationErrors?: string[];
  validationResult?: ValidationResult;
  executionTime?: number;
  resultCount?: number;
  queryId?: string; // For storing in database
}

export interface SAPTableContext {
  name: string;
  module: string; // FI, CO, MM, SD, HR, PP, etc.
  description: string;
  businessPurpose: string;
  columns: Array<{
    name: string;
    type: string;
    semanticType: string;
    description: string;
    businessContext: string;
    sampleValues: any[];
    isKey: boolean;
    isForeignKey: boolean;
    referencedTable?: string;
    referencedColumn?: string;
  }>;
}

export interface SAPRelationship {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  relationshipType: "foreign_key" | "semantic_match" | "business_rule";
  joinType: string;
  confidence: number;
  businessRule: string;
}

export class SAPQueryGenerator {
  private openai: OpenAI;
  private sapTableDefinitions: Map<string, SAPTableContext>;
  private validatorAgent: ValidatorAgent;
  private groundTruthBuilder: GroundTruthBuilder;
  private tableNameMapping: Record<string, string> = {
    VBAK: "VBAK",
    VBAP: "VBAP",
    MARA: "MARA",
    KNA1: "KNA1",
    // Only include tables that exist in the Prisma schema
    // Removed: BKPF, BSEG, EKKO, EKPO, LIKP, LIPS as they don't exist in the database
  };

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.sapTableDefinitions = new Map();
    this.validatorAgent = new ValidatorAgent(prisma);
    this.groundTruthBuilder = new GroundTruthBuilder(prisma);
    this.initializeSAPTableDefinitions();
  }

  private initializeSAPTableDefinitions() {
    // Define SAP table contexts with business meaning
    this.sapTableDefinitions.set("VBAK", {
      name: "VBAK",
      module: "SD",
      description: "Sales Document Header Data",
      businessPurpose:
        "Contains header information for sales orders, quotations, and contracts",
      columns: [
        {
          name: "VBELN",
          type: "VARCHAR(10)",
          semanticType: "identifier",
          description: "Sales Document Number",
          businessContext: "Unique identifier for sales documents",
          sampleValues: ["5000001234", "5000001235"],
          isKey: true,
          isForeignKey: false,
        },
        {
          name: "AUART",
          type: "CHAR(4)",
          semanticType: "category",
          description: "Sales Document Type",
          businessContext:
            "Defines the type of sales document (order, quotation, etc.)",
          sampleValues: ["OR", "QT", "CR"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "ERDAT",
          type: "DATE",
          semanticType: "date",
          description: "Created On",
          businessContext: "Date when the sales document was created",
          sampleValues: ["2025-01-15", "2025-01-16"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "KUNNR",
          type: "VARCHAR(10)",
          semanticType: "identifier",
          description: "Sold-to Party",
          businessContext: "Customer who placed the order",
          sampleValues: ["0000500000", "0000500001"],
          isKey: false,
          isForeignKey: true,
          referencedTable: "KNA1",
          referencedColumn: "KUNNR",
        },
        {
          name: "VKORG",
          type: "VARCHAR(4)",
          semanticType: "organization",
          description: "Sales Organization",
          businessContext: "Sales organization responsible for the sale",
          sampleValues: ["1000", "2000"],
          isKey: false,
          isForeignKey: false,
        },
      ],
    });

    this.sapTableDefinitions.set("VBAP", {
      name: "VBAP",
      module: "SD",
      description: "Sales Document Item Data",
      businessPurpose:
        "Contains line item details for sales documents including materials and quantities",
      columns: [
        {
          name: "VBELN",
          type: "VARCHAR(10)",
          semanticType: "identifier",
          description: "Sales Document Number",
          businessContext: "Links to sales document header",
          sampleValues: ["5000001234", "5000001235"],
          isKey: true,
          isForeignKey: true,
          referencedTable: "VBAK",
          referencedColumn: "VBELN",
        },
        {
          name: "POSNR",
          type: "VARCHAR(6)",
          semanticType: "identifier",
          description: "Sales Document Item",
          businessContext: "Line item number within the sales document",
          sampleValues: ["000010", "000020"],
          isKey: true,
          isForeignKey: false,
        },
        {
          name: "MATNR",
          type: "VARCHAR(18)",
          semanticType: "identifier",
          description: "Material Number",
          businessContext: "Product being sold",
          sampleValues: ["000000000000100000", "000000000000100001"],
          isKey: false,
          isForeignKey: true,
          referencedTable: "MARA",
          referencedColumn: "MATNR",
        },
        {
          name: "KWMENG",
          type: "DECIMAL(15,3)",
          semanticType: "quantity",
          description: "Cumulative Order Quantity",
          businessContext: "Total quantity ordered for this item",
          sampleValues: [10.0, 25.5],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "WERKS",
          type: "VARCHAR(4)",
          semanticType: "organization",
          description: "Plant",
          businessContext: "Manufacturing or distribution plant",
          sampleValues: ["1000", "2000"],
          isKey: false,
          isForeignKey: false,
        },
      ],
    });

    this.sapTableDefinitions.set("MARA", {
      name: "MARA",
      module: "MM",
      description: "General Material Master Data",
      businessPurpose:
        "Contains basic material information including material type, group, and unit of measure",
      columns: [
        {
          name: "MATNR",
          type: "VARCHAR(18)",
          semanticType: "identifier",
          description: "Material Number",
          businessContext: "Unique identifier for materials/products",
          sampleValues: ["000000000000100000", "000000000000100001"],
          isKey: true,
          isForeignKey: false,
        },
        {
          name: "MTART",
          type: "CHAR(4)",
          semanticType: "category",
          description: "Material Type",
          businessContext:
            "Categorizes materials (finished goods, raw materials, etc.)",
          sampleValues: ["FERT", "ROH", "HALB"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "MATKL",
          type: "VARCHAR(9)",
          semanticType: "category",
          description: "Material Group",
          businessContext: "Groups materials for reporting and analysis",
          sampleValues: ["UBHIOE", "FR3AWXF"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "MEINS",
          type: "CHAR(3)",
          semanticType: "unit",
          description: "Base Unit of Measure",
          businessContext: "Primary unit for measuring the material",
          sampleValues: ["KG", "LTR", "EA"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "LAEDA",
          type: "DATE",
          semanticType: "date",
          description: "Date of Last Change",
          businessContext: "When the material master was last modified",
          sampleValues: ["2025-08-07", "2025-07-24"],
          isKey: false,
          isForeignKey: false,
        },
      ],
    });

    this.sapTableDefinitions.set("KNA1", {
      name: "KNA1",
      module: "SD",
      description: "Customer Master General Data",
      businessPurpose:
        "Contains general customer information including name, address, and region",
      columns: [
        {
          name: "KUNNR",
          type: "VARCHAR(10)",
          semanticType: "identifier",
          description: "Customer Number",
          businessContext: "Unique identifier for customers",
          sampleValues: ["0000500000", "0000500001"],
          isKey: true,
          isForeignKey: false,
        },
        {
          name: "LAND1",
          type: "CHAR(2)",
          semanticType: "location",
          description: "Country Key",
          businessContext: "Country where customer is located",
          sampleValues: ["US", "DE", "UZ"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "ORT01",
          type: "VARCHAR(25)",
          semanticType: "location",
          description: "City",
          businessContext: "Customer city",
          sampleValues: ["Tremblayworth", "New Nella"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "NAME1",
          type: "VARCHAR(35)",
          semanticType: "name",
          description: "Name 1",
          businessContext: "Customer company or person name",
          sampleValues: ["Berge, Stiedemann and Wisozk", "Witting - King"],
          isKey: false,
          isForeignKey: false,
        },
        {
          name: "REGIO",
          type: "VARCHAR(3)",
          semanticType: "location",
          description: "Region",
          businessContext: "State or region code",
          sampleValues: ["DE", "NH", "CT"],
          isKey: false,
          isForeignKey: false,
        },
      ],
    });
  }

  async generateSAPQuery(request: SAPQueryRequest): Promise<SAPQueryResult> {
    try {
      console.log(`Generating SAP query for: "${request.prompt}"`);

      // Step 1: Analyze the business intent
      const businessIntent = await this.analyzeSAPBusinessIntent(
        request.prompt
      );

      // Step 2: Find relevant SAP tables and relationships
      const relevantContext = await this.findRelevantSAPContext(
        request.prompt,
        businessIntent
      );

      // Step 3: Generate the SQL query with SAP business logic
      const sqlResult = await this.generateSAPSQL(
        request.prompt,
        relevantContext,
        request
      );

      // Step 4: Validate against SAP business rules (legacy validation)
      const validation = await this.validateSAPQuery(
        sqlResult.sql,
        relevantContext
      );

      // Step 5: Enhanced validation using ValidatorAgent
      const groundTruthGraph =
        await this.validatorAgent.getGroundTruthForValidation();
      let validationResult: ValidationResult | null = null;

      if (groundTruthGraph) {
        validationResult = await this.validatorAgent.validateQuery(
          sqlResult.sql,
          groundTruthGraph,
          request.businessContext
        );
      }

      // Step 6: Calculate complexity and determine SAP modules
      const complexity = this.calculateSAPComplexity(
        sqlResult.sql,
        relevantContext
      );
      const sapModules = this.determineSAPModules(relevantContext.tables);

      // Combine validation results
      const finalValidationStatus =
        validationResult?.isValid && validation.isValid
          ? "valid"
          : (validationResult?.warnings?.length || 0) > 0 ||
              validation.hasWarnings
            ? "warning"
            : "invalid";
      const allErrors = [
        ...(validation.errors || []),
        ...(validationResult?.errors || []),
      ];

      const result: SAPQueryResult = {
        sql: sqlResult.sql,
        confidence: Math.min(
          sqlResult.confidence,
          validationResult?.confidence || 1.0
        ),
        explanation: sqlResult.explanation,
        businessLogic: sqlResult.businessLogic,
        tablesUsed: relevantContext.tables.map((t) => t.name),
        joinTypes: relevantContext.relationships.map((r) => r.joinType),
        complexity,
        sapModules,
        validationStatus: finalValidationStatus,
        validationErrors: allErrors.length > 0 ? allErrors : undefined,
        validationResult: validationResult || undefined,
      };

      // Step 6: Save the generated query (only if autoSave is enabled)
      if (request.autoSave !== false) {
        // Default to true for backward compatibility
        const queryId = await this.saveGeneratedSAPQuery(
          request.prompt,
          result
        );
        if (queryId) {
          result.queryId = queryId;
        }
      }

      return result;
    } catch (error) {
      console.error("Error generating SAP query:", error);
      throw new Error(
        `Failed to generate SAP query: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async analyzeSAPBusinessIntent(prompt: string): Promise<{
    type:
      | "sales_analysis"
      | "material_inquiry"
      | "customer_data"
      | "financial_report"
      | "procurement"
      | "complex_join";
    entities: string[];
    businessObjects: string[];
    operations: string[];
    filters: string[];
    sapModules: string[];
  }> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an SAP business analyst. Analyze the user's request to understand the business intent.
          
          SAP Modules:
          - FI: Financial Accounting
          - CO: Controlling  
          - MM: Materials Management
          - SD: Sales & Distribution
          - HR: Human Resources
          - PP: Production Planning
          - PM: Plant Maintenance
          - QM: Quality Management
          
          Common SAP Business Objects:
          - Sales Orders (VBAK/VBAP)
          - Materials (MARA)
          - Customers (KNA1)
          - Vendors (LFA1)
          - Purchase Orders (EKKO/EKPO)
          - Deliveries (LIKP/LIPS)
          - Invoices (VBRK/VBRP)
          
          Return a JSON object with the analysis.`,
        },
        {
          role: "user",
          content: `Analyze this SAP query request: "${prompt}"`,
        },
      ],
      temperature: 0.1,
    });

    try {
      const content = completion.choices[0].message.content;
      if (!content) throw new Error("No content in OpenAI response");
      return JSON.parse(content);
    } catch (error) {
      console.error("Error parsing business intent:", error);
      return {
        type: "complex_join",
        entities: [],
        businessObjects: [],
        operations: ["select"],
        filters: [],
        sapModules: ["SD", "MM"],
      };
    }
  }

  private async findRelevantSAPContext(
    prompt: string,
    intent: any
  ): Promise<{
    tables: SAPTableContext[];
    relationships: SAPRelationship[];
  }> {
    // Find relevant tables based on business intent
    const relevantTables: SAPTableContext[] = [];
    const relationships: SAPRelationship[] = [];

    // Add tables based on business objects mentioned
    if (
      prompt.toLowerCase().includes("sales") ||
      prompt.toLowerCase().includes("order")
    ) {
      const vbak = this.sapTableDefinitions.get("VBAK");
      const vbap = this.sapTableDefinitions.get("VBAP");
      if (vbak) relevantTables.push(vbak);
      if (vbap) relevantTables.push(vbap);
    }

    if (
      prompt.toLowerCase().includes("material") ||
      prompt.toLowerCase().includes("product")
    ) {
      const mara = this.sapTableDefinitions.get("MARA");
      if (mara) relevantTables.push(mara);
    }

    if (prompt.toLowerCase().includes("customer")) {
      const kna1 = this.sapTableDefinitions.get("KNA1");
      if (kna1) relevantTables.push(kna1);
    }

    // Enhanced logic for customer purchase/amount queries
    if (
      prompt.toLowerCase().includes("customer") &&
      (prompt.toLowerCase().includes("purchase") ||
        prompt.toLowerCase().includes("amount") ||
        prompt.toLowerCase().includes("total") ||
        prompt.toLowerCase().includes("revenue") ||
        prompt.toLowerCase().includes("value"))
    ) {
      // For customer purchase analysis, we need sales data (VBAK/VBAP)
      const vbak = this.sapTableDefinitions.get("VBAK");
      const vbap = this.sapTableDefinitions.get("VBAP");
      if (vbak && !relevantTables.some((t) => t.name === "VBAK"))
        relevantTables.push(vbak);
      if (vbap && !relevantTables.some((t) => t.name === "VBAP"))
        relevantTables.push(vbap);
    }

    // Define standard SAP relationships
    if (
      relevantTables.some((t) => t.name === "VBAK") &&
      relevantTables.some((t) => t.name === "VBAP")
    ) {
      relationships.push({
        leftTable: "VBAK",
        leftColumn: "VBELN",
        rightTable: "VBAP",
        rightColumn: "VBELN",
        relationshipType: "foreign_key",
        joinType: "INNER",
        confidence: 1.0,
        businessRule: "Sales document header to items relationship",
      });
    }

    if (
      relevantTables.some((t) => t.name === "VBAP") &&
      relevantTables.some((t) => t.name === "MARA")
    ) {
      relationships.push({
        leftTable: "VBAP",
        leftColumn: "MATNR",
        rightTable: "MARA",
        rightColumn: "MATNR",
        relationshipType: "foreign_key",
        joinType: "INNER",
        confidence: 1.0,
        businessRule: "Sales item to material master relationship",
      });
    }

    if (
      relevantTables.some((t) => t.name === "VBAK") &&
      relevantTables.some((t) => t.name === "KNA1")
    ) {
      relationships.push({
        leftTable: "VBAK",
        leftColumn: "KUNNR",
        rightTable: "KNA1",
        rightColumn: "KUNNR",
        relationshipType: "foreign_key",
        joinType: "INNER",
        confidence: 1.0,
        businessRule: "Sales document to customer relationship",
      });
    }

    return { tables: relevantTables, relationships };
  }

  private async generateSAPSQL(
    prompt: string,
    context: { tables: SAPTableContext[]; relationships: SAPRelationship[] },
    request: SAPQueryRequest
  ): Promise<{
    sql: string;
    confidence: number;
    explanation: string;
    businessLogic: string;
  }> {
    const systemPrompt = `You are an expert SAP consultant and SQL developer specializing in complex analytical queries. Generate optimized SQL queries for SAP systems.

CRITICAL REQUIREMENTS:
1. ONLY use tables from this EXACT list (case-sensitive): ${context.tables.map((t) => t.name).join(", ")}
2. NEVER use any other SAP tables (like VBRK, VBRP, etc.) - they do not exist in this system
3. Use EXACT column names as provided (case-sensitive) - all column names are UPPERCASE
4. Table names and column names are CASE-SENSITIVE and must be used EXACTLY as shown
5. Use proper column aliases with descriptive business names using underscores (e.g., Total_Order_Value)
6. Follow SAP naming conventions and business logic
7. Use ${request.preferredJoinType?.toUpperCase() || "INNER"} JOINs unless business logic requires otherwise
8. Include appropriate WHERE clauses for filtering
9. Return only valid PostgreSQL-compatible SQL
10. Do NOT use lowercase table or column names - use the exact case provided
11. If you cannot fulfill the request with the available tables, explain the limitation clearly

Available SAP Tables:
${context.tables
  .map(
    (table) => `
${table.name} (${table.module} Module) - ${table.description}
Business Purpose: ${table.businessPurpose}
Key Columns: ${table.columns
      .slice(0, 8)
      .map((col) => `${col.name} (${col.type}) - ${col.description}`)
      .join(", ")}`
  )
  .join("\n")}

Available Relationships:
${context.relationships
  .map(
    (rel) =>
      `${rel.leftTable}.${rel.leftColumn} -> ${rel.rightTable}.${rel.rightColumn} (${rel.joinType})`
  )
  .join("\n")}

For complex analytical queries, use these advanced SQL techniques:
- CTEs (WITH clauses) for multi-step calculations and better readability
- Window functions (ROW_NUMBER, RANK, SUM() OVER, etc.) for analytical calculations
- CASE statements for conditional logic and categorization
- Subqueries for complex filtering and calculations
- Proper aggregations (SUM, COUNT, AVG) with GROUP BY
- Date/time functions for temporal analysis
- String functions for text analysis and pattern matching
- Mathematical functions for ratio and score calculations

CRITICAL JSON FORMATTING:
- You MUST return ONLY a valid JSON object
- Do NOT include markdown code blocks, backticks, or any other formatting
- Do NOT include any text before or after the JSON
- Ensure all strings are properly escaped
- For complex SQL, break long queries into readable lines within the JSON string using \\n

EXAMPLE SQL STRUCTURE:
SELECT "VBAK"."VBELN"  AS Sales_Document_Number,
       "VBAK"."AUART"  AS Sales_Document_Type,
       "VBAK"."ERDAT"  AS Created_On,
       "VBAP"."MATNR"  AS Material_Number,
       "VBAP"."KWMENG" AS Order_Quantity,
       "MARA"."MTART"  AS Material_Type,
       "MARA"."MATKL"  AS Material_Group,
       "KNA1"."NAME1"  AS Customer_Name
FROM   "VBAK"
       INNER JOIN "VBAP"
               ON "VBAK"."VBELN" = "VBAP"."VBELN"
       INNER JOIN "MARA"
               ON "VBAP"."MATNR" = "MARA"."MATNR"
       INNER JOIN "KNA1"
               ON "VBAK"."KUNNR" = "KNA1"."KUNNR"
WHERE  "VBAK"."KUNNR" = '500000' 

SAP Query Best Practices:
1. Use meaningful column aliases that reflect business terminology
2. Include proper JOIN conditions based on SAP relationships
3. Consider performance with appropriate WHERE clauses
4. Use SAP naming conventions
5. Include business-relevant filters

Generate a SQL query that follows SAP best practices and includes:
1. The SQL query
2. Confidence score (0.0-1.0)
3. Technical explanation
4. Business logic explanation

Return the response in this exact JSON format (and nothing else):
{
  "sql": "WITH customer_analysis AS (\\n  SELECT ...\\n) SELECT ... FROM customer_analysis",
  "confidence": 0.95,
  "explanation": "Technical explanation of the query structure, CTEs, and joins used",
  "businessLogic": "Business logic explanation covering the analytical approach and metrics calculated"
}`;

    const userPrompt = `Business Requirement: ${prompt}

STRICT CONSTRAINTS:
- ONLY use these tables: ${context.tables.map((t) => t.name).join(", ")}
- DO NOT use any other SAP tables (VBRK, VBRP, etc.) - they do not exist
- If the requirement cannot be met with available tables, explain the limitation clearly

Query Generation Guidelines:
1. Use ONLY the EXACT table names provided (case-sensitive): ${context.tables.map((t) => t.name).join(", ")}
2. Include meaningful column aliases using underscores (e.g., Total_Order_Value, Customer_Name)
3. Implement proper JOIN conditions based on SAP relationships
4. Follow SAP business logic and conventions
5. Use proper PostgreSQL syntax with advanced features

For Complex Analytical Requirements:
- Break down multi-dimensional analysis into logical CTEs
- Use window functions for ranking, running totals, and comparative analysis
- Implement proper date filtering and time-series analysis
- Calculate business metrics using appropriate aggregations
- Use CASE statements for categorization and conditional logic
- Apply string functions for pattern matching and text analysis
- Create calculated fields for ratios, scores, and derived metrics

CRITICAL JSON FORMATTING RULES:
- Return ONLY a valid JSON object
- NO markdown code blocks, backticks, or additional formatting
- NO text before or after the JSON
- Properly escape all strings within the JSON
- Use \\n for line breaks in SQL strings
- Ensure the JSON is complete and well-formed

Return the response in this exact JSON format (and nothing else):
{
  "sql": "WITH analysis_cte AS (\\n  SELECT ...\\n  FROM ...\\n  WHERE ...\\n)\\nSELECT ... FROM analysis_cte",
  "confidence": 0.95,
  "explanation": "Technical explanation covering CTEs, joins, window functions, and analytical approach",
  "businessLogic": "Business logic explanation covering metrics, calculations, and analytical insights provided"
}`;

    // Determine appropriate token limit based on prompt complexity
    const promptComplexity = this.assessPromptComplexity(prompt);
    const maxTokens = this.getTokenLimitForComplexity(promptComplexity);

    console.log(
      `Prompt complexity: ${promptComplexity}, using ${maxTokens} max tokens`
    );

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    });

    try {
      const content = completion.choices[0].message.content;
      if (!content) throw new Error("No content in OpenAI response");

      console.log(
        "OpenAI Response Content (first 500 chars):",
        content.substring(0, 500)
      );
      console.log("Response length:", content.length);

      // Enhanced JSON parsing with better error handling
      let result: any = null;
      let parseMethod = "";

      // Strategy 1: Try to find JSON between ```json and ``` markers
      const jsonCodeBlockMatch = content.match(
        /```json\s*(\{[\s\S]*?\})\s*```/
      );
      if (jsonCodeBlockMatch) {
        try {
          result = JSON.parse(jsonCodeBlockMatch[1]);
          parseMethod = "code block";
          console.log("Successfully parsed JSON from code block");
        } catch (e) {
          console.log("Failed to parse JSON from code block:", e);
        }
      }

      // Strategy 2: Try to find complete JSON object with balanced braces
      if (!result) {
        const firstBrace = content.indexOf("{");
        if (firstBrace !== -1) {
          let braceCount = 0;
          let endIndex = -1;

          for (let i = firstBrace; i < content.length; i++) {
            if (content[i] === "{") braceCount++;
            if (content[i] === "}") braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }

          if (endIndex !== -1) {
            try {
              const jsonStr = content.substring(firstBrace, endIndex + 1);
              result = JSON.parse(jsonStr);
              parseMethod = "brace matching";
              console.log("Successfully parsed JSON with brace matching");
            } catch (e) {
              console.log("Failed to parse JSON with brace matching:", e);
            }
          }
        }
      }

      // Strategy 3: Try to parse the entire content as JSON
      if (!result) {
        try {
          result = JSON.parse(content);
          parseMethod = "entire content";
          console.log("Successfully parsed entire content as JSON");
        } catch (e) {
          console.log("Failed to parse entire content as JSON:", e);
        }
      }

      // Strategy 4: Try to extract and repair truncated JSON
      if (!result) {
        result = this.attemptJSONRepair(content);
        if (result) {
          parseMethod = "JSON repair";
          console.log("Successfully repaired and parsed truncated JSON");
        }
      }

      // If all strategies fail, check if response was truncated
      if (!result) {
        const isTruncated = this.isResponseTruncated(content);
        if (isTruncated) {
          console.error(
            "Response appears to be truncated. Attempting retry with higher token limit."
          );
          // Retry with higher token limit if not already at maximum
          if (maxTokens < 32768) {
            return this.generateSAPSQL(prompt, context, {
              ...request,
              maxTables: Math.min(request.maxTables || 5, 3), // Reduce complexity for retry
            });
          }
        }

        console.error("All JSON parsing strategies failed. Content:", content);
        throw new Error(
          `Invalid JSON response format. Content: ${content.substring(0, 500)}... (Parse method attempted: ${parseMethod || "none"})`
        );
      }

      console.log(`Successfully parsed JSON using method: ${parseMethod}`);

      // Validate that the result has required fields
      if (!result.sql || typeof result.sql !== "string") {
        console.error("Invalid result: missing or invalid sql field", result);
        throw new Error('OpenAI response missing required "sql" field');
      }

      // Set default values for missing fields
      result.confidence =
        typeof result.confidence === "number" ? result.confidence : 0.5;
      result.explanation =
        typeof result.explanation === "string"
          ? result.explanation
          : "SQL query generated";
      result.businessLogic =
        typeof result.businessLogic === "string"
          ? result.businessLogic
          : "Business logic explanation";

      console.log("Successfully parsed and validated JSON result");

      // Validate that the SQL uses correct table names
      let sql = result.sql || "";

      // Ensure table names and column names are properly cased and quoted for PostgreSQL
      context.tables.forEach((table) => {
        // Replace unquoted table names with quoted versions (avoid double quoting)
        const unquotedRegex = new RegExp(`(?<!")\\b${table.name}\\b(?!")`, "g");
        const lowercaseRegex = new RegExp(
          `(?<!")\\b${table.name.toLowerCase()}\\b(?!")`,
          "gi"
        );

        // Quote the table names for PostgreSQL
        sql = sql.replace(unquotedRegex, `"${table.name}"`);
        sql = sql.replace(lowercaseRegex, `"${table.name}"`);

        // Quote column names for PostgreSQL
        table.columns.forEach((column) => {
          const columnRegex = new RegExp(
            `(?<!")\\b${column.name.toLowerCase()}\\b(?!")`,
            "gi"
          );
          sql = sql.replace(columnRegex, `"${column.name}"`);
        });
      });

      return {
        sql: sql,
        confidence: result.confidence || 0.5,
        explanation: result.explanation || "SQL query generated",
        businessLogic: result.businessLogic || "Business logic explanation",
      };
    } catch (error) {
      console.error("Error parsing SQL generation result:", error);
      // Fallback to a simple query
      return this.generateFallbackSAPQuery(prompt, context);
    }
  }

  private assessPromptComplexity(
    prompt: string
  ): "simple" | "medium" | "complex" | "extreme" {
    const complexityIndicators = {
      simple: ["show", "get", "find", "list"],
      medium: ["join", "group by", "order by", "count", "sum", "average"],
      complex: [
        "analysis",
        "report",
        "breakdown",
        "correlation",
        "pattern",
        "trend",
      ],
      extreme: [
        "multi-dimensional",
        "comprehensive",
        "cross-reference",
        "time-series",
        "seasonal",
        "complexity score",
        "confidence interval",
      ],
    };

    const lowerPrompt = prompt.toLowerCase();
    let score = 0;

    // Count indicators for each complexity level
    Object.entries(complexityIndicators).forEach(([level, indicators]) => {
      const matches = indicators.filter((indicator) =>
        lowerPrompt.includes(indicator)
      ).length;
      switch (level) {
        case "simple":
          score += matches * 1;
          break;
        case "medium":
          score += matches * 2;
          break;
        case "complex":
          score += matches * 3;
          break;
        case "extreme":
          score += matches * 5;
          break;
      }
    });

    // Additional complexity factors
    const wordCount = prompt.split(/\s+/).length;
    const hasMultipleConditions = (prompt.match(/\band\b/gi) || []).length > 3;
    const hasCalculations = /calculate|ratio|score|metric|percentage/i.test(
      prompt
    );
    const hasTimeAnalysis = /monthly|seasonal|time-series|date|period/i.test(
      prompt
    );

    if (wordCount > 200) score += 3;
    if (hasMultipleConditions) score += 2;
    if (hasCalculations) score += 2;
    if (hasTimeAnalysis) score += 2;

    if (score >= 15) return "extreme";
    if (score >= 10) return "complex";
    if (score >= 5) return "medium";
    return "simple";
  }

  private getTokenLimitForComplexity(
    complexity: "simple" | "medium" | "complex" | "extreme"
  ): number {
    switch (complexity) {
      case "simple":
        return 1000;
      case "medium":
        return 2000;
      case "complex":
        return 3000;
      case "extreme":
        return 32768;
      default:
        return 1500;
    }
  }

  private attemptJSONRepair(content: string): any | null {
    try {
      // Try to find the start of JSON and attempt to complete it
      const firstBrace = content.indexOf("{");
      if (firstBrace === -1) return null;

      let jsonStr = content.substring(firstBrace);

      // If the JSON appears to be truncated, try to close it properly
      if (!jsonStr.endsWith("}")) {
        // Count open braces to determine how many closing braces we need
        let openBraces = 0;
        let inString = false;
        let escaped = false;

        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === "\\") {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === "{") openBraces++;
            if (char === "}") openBraces--;
          }
        }

        // Add missing closing braces and quotes if needed
        if (inString) {
          jsonStr += '"';
        }

        // Close any incomplete string values
        if (jsonStr.match(/:\s*"[^"]*$/)) {
          jsonStr += '"';
        }

        // Add missing closing braces
        for (let i = 0; i < openBraces; i++) {
          jsonStr += "}";
        }
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      console.log("JSON repair failed:", error);
      return null;
    }
  }

  private isResponseTruncated(content: string): boolean {
    // Check for common truncation indicators
    const truncationIndicators = [
      /\.\.\.$/, // Ends with ...
      /[^}]$/, // Doesn't end with closing brace
      /"sql":\s*"[^"]*$/, // SQL field is not properly closed
      /,\s*$/, // Ends with comma
      /"[^"]*$/, // Ends with unclosed quote
    ];

    return truncationIndicators.some((pattern) => pattern.test(content.trim()));
  }

  private generateFallbackSAPQuery(
    prompt: string,
    context: { tables: SAPTableContext[]; relationships: SAPRelationship[] }
  ): {
    sql: string;
    confidence: number;
    explanation: string;
    businessLogic: string;
  } {
    if (context.tables.length === 0) {
      return {
        sql: "SELECT 'No relevant tables found' AS message;",
        confidence: 0.1,
        explanation:
          "No relevant SAP tables could be identified for this query.",
        businessLogic: "Unable to determine business context.",
      };
    }

    // Generate a basic SELECT with JOINs
    const mainTable = context.tables[0];
    let sql = `SELECT\n`;

    // Add columns from all tables
    const columns: string[] = [];
    context.tables.forEach((table) => {
      table.columns.slice(0, 3).forEach((col) => {
        columns.push(
          `    "${table.name}".${col.name} AS ${col.description.replace(/\s+/g, "_")}`
        );
      });
    });

    sql += columns.join(",\n") + "\n";
    sql += `FROM "${mainTable.name}"\n`;

    // Add JOINs
    context.relationships.forEach((rel) => {
      sql += `${rel.joinType} JOIN "${rel.rightTable}" ON "${rel.leftTable}".${rel.leftColumn} = "${rel.rightTable}".${rel.rightColumn}\n`;
    });

    return {
      sql,
      confidence: 0.6,
      explanation: "Generated fallback query with basic table joins.",
      businessLogic: "Basic multi-table query to retrieve related SAP data.",
    };
  }

  private async validateSAPQuery(
    sql: string,
    context: any
  ): Promise<{
    isValid: boolean;
    hasWarnings: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let hasWarnings = false;

    // Basic SQL syntax validation
    if (!sql.trim().toUpperCase().startsWith("SELECT")) {
      errors.push("Query must start with SELECT");
    }

    // Check for non-existent tables in the SQL
    const sqlUpper = sql.toUpperCase();
    const validTables = Object.keys(this.tableNameMapping);
    const invalidTables = [
      "VBRK",
      "VBRP",
      "BKPF",
      "BSEG",
      "EKKO",
      "EKPO",
      "LIKP",
      "LIPS",
    ];

    invalidTables.forEach((table) => {
      if (sqlUpper.includes(table)) {
        errors.push(`Invalid tables detected: ${table}`);
      }
    });

    // Extract table names from SQL to validate they exist
    const tableMatches = sql.match(
      /FROM\s+["`]?(\w+)["`]?|JOIN\s+["`]?(\w+)["`]?/gi
    );
    if (tableMatches) {
      tableMatches.forEach((match) => {
        const tableName = match
          .replace(/FROM\s+|JOIN\s+|["`]/gi, "")
          .trim()
          .toUpperCase();
        if (!validTables.includes(tableName) && tableName !== "") {
          errors.push(`Invalid tables detected: ${tableName}`);
        }
      });
    }

    // Check for lowercase table names (should be uppercase)
    const lowercaseTableMatches = sql.match(/["`]([a-z]+)["`]/g);
    if (lowercaseTableMatches) {
      const lowercaseTables = lowercaseTableMatches
        .map((match) => match.replace(/["`]/g, ""))
        .filter((table) =>
          validTables.map((t) => t.toLowerCase()).includes(table)
        );

      if (lowercaseTables.length > 0) {
        errors.push(
          `Invalid joins detected: ${lowercaseTables.map((t) => t.toUpperCase()).join(", ")} = ${lowercaseTables.map((t) => t.toUpperCase()).join(", ")}`
        );
      }
    }

    // Check for required SAP table references
    context.tables.forEach((table: SAPTableContext) => {
      if (!sqlUpper.includes(table.name)) {
        hasWarnings = true;
        errors.push(`Warning: Table ${table.name} not referenced in query`);
      }
    });

    return {
      isValid: errors.filter((e) => !e.startsWith("Warning:")).length === 0,
      hasWarnings,
      errors,
    };
  }

  private calculateSAPComplexity(
    sql: string,
    context: any
  ): "simple" | "medium" | "complex" {
    const sqlUpper = sql.toUpperCase();
    let complexity = 0;

    // Count complexity factors
    if (sqlUpper.includes("JOIN")) complexity += 1;
    if ((sqlUpper.match(/JOIN/g) || []).length > 2) complexity += 2;
    if (sqlUpper.includes("WHERE")) complexity += 1;
    if (sqlUpper.includes("GROUP BY")) complexity += 2;
    if (sqlUpper.includes("HAVING")) complexity += 2;
    if (sqlUpper.includes("ORDER BY")) complexity += 1;
    if (context.tables.length > 3) complexity += 2;

    if (complexity <= 2) return "simple";
    if (complexity <= 5) return "medium";
    return "complex";
  }

  private determineSAPModules(tables: SAPTableContext[]): string[] {
    const modules = new Set<string>();
    tables.forEach((table) => modules.add(table.module));
    return Array.from(modules);
  }

  private async saveGeneratedSAPQuery(
    prompt: string,
    result: SAPQueryResult
  ): Promise<string | null> {
    try {
      // Check for duplicate queries within the last 5 minutes to prevent accidental duplicates
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const existingQuery = await this.prisma.generatedQuery.findFirst({
        where: {
          prompt: prompt,
          sql: result.sql,
          createdAt: {
            gte: fiveMinutesAgo,
          },
        },
      });

      if (existingQuery) {
        console.log(`Skipping duplicate query save for prompt: "${prompt}"`);
        return existingQuery.id;
      }

      const savedQuery = await this.prisma.generatedQuery.create({
        data: {
          prompt,
          sql: result.sql,
          confidence: result.confidence,
          tablesUsed: result.tablesUsed,
          joinTypes: result.joinTypes,
          complexity: result.complexity,
          validationStatus: result.validationStatus,
          validationErrors: result.validationErrors || [],
          executionTime: result.executionTime,
          resultCount: result.resultCount,
        },
      });
      return savedQuery.id;
    } catch (error) {
      console.error("Error saving generated query:", error);
      return null;
    }
  }

  async executeQuery(
    sql: string
  ): Promise<{ results: any[]; executionTime: number; rowCount: number }> {
    const startTime = Date.now();

    try {
      // Execute the query using Prisma's raw query capability
      const results = await this.prisma.$queryRawUnsafe(sql);
      const executionTime = Date.now() - startTime;

      return {
        results: Array.isArray(results) ? results : [results],
        executionTime,
        rowCount: Array.isArray(results) ? results.length : 1,
      };
    } catch (error) {
      console.error("Query execution error:", error);
      throw new Error(
        `Query execution failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
