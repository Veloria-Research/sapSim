import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

export interface QueryGenerationRequest {
  prompt: string;
  maxTables?: number;
  includeExplanation?: boolean;
  preferredJoinType?: 'inner' | 'left' | 'right' | 'full';
}

export interface GeneratedQueryResult {
  sql: string;
  confidence: number;
  explanation: string;
  tablesUsed: string[];
  joinTypes: string[];
  complexity: 'simple' | 'medium' | 'complex';
  templateUsed?: string;
  validationStatus: 'valid' | 'invalid' | 'warning';
  validationErrors?: string[];
  executionTime?: number;
  resultCount?: number;
}

export interface QueryContext {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      semanticType: string;
      description: string;
      businessContext: string;
    }>;
  }>;
  relationships: Array<{
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    joinType: string;
    confidence: number;
  }>;
}

export class QueryGenerator {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateQuery(request: QueryGenerationRequest): Promise<GeneratedQueryResult> {
    try {
      // Step 1: Analyze the prompt to understand intent
      const intent = await this.analyzePromptIntent(request.prompt);
      
      // Step 2: Find relevant tables and columns
      const relevantContext = await this.findRelevantContext(request.prompt, intent);
      
      // Step 3: Check for existing query templates
      const template = await this.findMatchingTemplate(request.prompt);
      
      // Step 4: Generate SQL query
      const sqlResult = await this.generateSQLQuery(
        request.prompt, 
        relevantContext, 
        template,
        request
      );
      
      // Step 5: Validate the generated query
      const validation = await this.validateQuery(sqlResult.sql, relevantContext);
      
      // Step 6: Calculate complexity
      const complexity = this.calculateComplexity(sqlResult.sql, relevantContext);
      
      const result: GeneratedQueryResult = {
        sql: sqlResult.sql,
        confidence: sqlResult.confidence,
        explanation: sqlResult.explanation,
        tablesUsed: relevantContext.tables.map(t => t.name),
        joinTypes: relevantContext.relationships.map(r => r.joinType),
        complexity,
        templateUsed: template?.id,
        validationStatus: validation.isValid ? 'valid' : (validation.hasWarnings ? 'warning' : 'invalid'),
        validationErrors: validation.errors
      };
      
      // Step 7: Save the generated query
      await this.saveGeneratedQuery(request.prompt, result);
      
      return result;
      
    } catch (error) {
      console.error('Error generating query:', error);
      throw new Error(`Failed to generate query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async analyzePromptIntent(prompt: string): Promise<{
    type: 'select' | 'aggregate' | 'filter' | 'join' | 'complex';
    entities: string[];
    operations: string[];
    filters: string[];
  }> {
    const analysisPrompt = `Analyze this natural language database query and extract the intent:

Query: "${prompt}"

Identify:
1. Query type: select, aggregate, filter, join, or complex
2. Entities mentioned (table names, business objects)
3. Operations requested (count, sum, average, list, etc.)
4. Filters or conditions mentioned

Respond in JSON format:
{
  "type": "...",
  "entities": ["..."],
  "operations": ["..."],
  "filters": ["..."]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: analysisPrompt }],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('Error analyzing prompt intent:', error);
      // Fallback analysis
      return {
        type: 'select',
        entities: this.extractEntitiesFromPrompt(prompt),
        operations: ['list'],
        filters: []
      };
    }
  }

  private extractEntitiesFromPrompt(prompt: string): string[] {
    const entities: string[] = [];
    const lowerPrompt = prompt.toLowerCase();
    
    // Common SAP entities
    if (lowerPrompt.includes('customer') || lowerPrompt.includes('client')) entities.push('customer');
    if (lowerPrompt.includes('material') || lowerPrompt.includes('product')) entities.push('material');
    if (lowerPrompt.includes('sales') || lowerPrompt.includes('order')) entities.push('sales');
    if (lowerPrompt.includes('item') || lowerPrompt.includes('line')) entities.push('item');
    
    return entities;
  }

  private async findRelevantContext(prompt: string, intent: any): Promise<QueryContext> {
    // Find relevant columns using semantic search
    const relevantColumns = await this.findRelevantColumns(prompt);
    
    // Group columns by table
    const tableMap = new Map<string, any[]>();
    for (const col of relevantColumns) {
      if (!tableMap.has(col.tableName)) {
        tableMap.set(col.tableName, []);
      }
      tableMap.get(col.tableName)!.push({
        name: col.columnName,
        type: col.dataType,
        semanticType: col.semanticType,
        description: col.description,
        businessContext: col.businessContext
      });
    }

    // Build tables array
    const tables = Array.from(tableMap.entries()).map(([name, columns]) => ({
      name,
      columns
    }));

    // Find relationships between the relevant tables
    const relationships = await this.findTableRelationships(tables.map(t => t.name));

    return { tables, relationships };
  }

  private async findRelevantColumns(prompt: string, limit: number = 20): Promise<any[]> {
    try {
      // Use semantic search to find relevant columns
      const results = await this.prisma.$queryRaw<any[]>`
        SELECT 
          "tableName",
          "columnName",
          "dataType",
          "semanticType",
          description,
          "businessContext"
        FROM "ColumnMetadata"
        WHERE 
          description ILIKE ${'%' + prompt + '%'} OR
          "businessContext" ILIKE ${'%' + prompt + '%'} OR
          "semanticType" IN ('identifier', 'name', 'amount', 'date', 'status')
        ORDER BY 
          CASE 
            WHEN description ILIKE ${'%' + prompt + '%'} THEN 1
            WHEN "businessContext" ILIKE ${'%' + prompt + '%'} THEN 2
            ELSE 3
          END
        LIMIT ${limit}
      `;

      return results;
    } catch (error) {
      console.error('Error finding relevant columns:', error);
      // Fallback: return basic SAP table structure
      return [
        { tableName: 'KNA1', columnName: 'KUNNR', dataType: 'VARCHAR(10)', semanticType: 'identifier', description: 'Customer number', businessContext: 'Unique identifier for customers' },
        { tableName: 'KNA1', columnName: 'NAME1', dataType: 'VARCHAR(35)', semanticType: 'name', description: 'Customer name', businessContext: 'Primary name of the customer' },
        { tableName: 'MARA', columnName: 'MATNR', dataType: 'VARCHAR(18)', semanticType: 'identifier', description: 'Material number', businessContext: 'Unique identifier for materials' },
        { tableName: 'VBAK', columnName: 'VBELN', dataType: 'VARCHAR(10)', semanticType: 'identifier', description: 'Sales document number', businessContext: 'Unique identifier for sales orders' }
      ];
    }
  }

  private async findTableRelationships(tableNames: string[]): Promise<any[]> {
    try {
      const relationships = await this.prisma.tableRelationship.findMany({
        where: {
          AND: [
            { leftTable: { in: tableNames } },
            { rightTable: { in: tableNames } }
          ]
        },
        orderBy: { confidence: 'desc' }
      });

      return relationships.map(rel => ({
        leftTable: rel.leftTable,
        leftColumn: rel.leftColumn,
        rightTable: rel.rightTable,
        rightColumn: rel.rightColumn,
        joinType: rel.joinType,
        confidence: rel.confidence
      }));
    } catch (error) {
      console.error('Error finding table relationships:', error);
      // Fallback: basic SAP relationships
      return [
        { leftTable: 'VBAK', leftColumn: 'KUNNR', rightTable: 'KNA1', rightColumn: 'KUNNR', joinType: 'left', confidence: 0.9 },
        { leftTable: 'VBAP', leftColumn: 'VBELN', rightTable: 'VBAK', rightColumn: 'VBELN', joinType: 'inner', confidence: 0.95 },
        { leftTable: 'VBAP', leftColumn: 'MATNR', rightTable: 'MARA', rightColumn: 'MATNR', joinType: 'left', confidence: 0.85 }
      ];
    }
  }

  private async findMatchingTemplate(prompt: string): Promise<any | null> {
    try {
      const templates = await this.prisma.queryTemplate.findMany({
        where: {
          pattern: {
            contains: prompt,
            mode: 'insensitive'
          }
        },
        orderBy: { confidence: 'desc' },
        take: 1
      });

      return templates[0] || null;
    } catch (error) {
      console.error('Error finding matching template:', error);
      return null;
    }
  }

  private async generateSQLQuery(
    prompt: string,
    context: QueryContext,
    template: any | null,
    request: QueryGenerationRequest
  ): Promise<{ sql: string; confidence: number; explanation: string }> {
    const systemPrompt = `You are an expert SQL query generator for SAP-like database systems. Generate precise SQL queries based on natural language requests.

Available Tables and Columns:
${context.tables.map(table => `
Table: ${table.name}
Columns: ${table.columns.map(col => `${col.name} (${col.type}) - ${col.description}`).join(', ')}
`).join('\n')}

Available Relationships:
${context.relationships.map(rel => `${rel.leftTable}.${rel.leftColumn} -> ${rel.rightTable}.${rel.rightColumn} (${rel.joinType} join, confidence: ${rel.confidence})`).join('\n')}

Rules:
1. Use proper SQL syntax for PostgreSQL
2. Include appropriate JOIN clauses based on relationships
3. Use table aliases for readability
4. Include only necessary columns in SELECT
5. Add appropriate WHERE clauses for filtering
6. Use proper data types in comparisons
7. Ensure the query is optimized and follows best practices

${template ? `Template available: ${template.sqlTemplate}` : ''}`;

    const userPrompt = `Generate a SQL query for: "${prompt}"

Provide response in JSON format:
{
  "sql": "SELECT ... FROM ... WHERE ...",
  "confidence": 0.85,
  "explanation": "This query retrieves..."
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('Error generating SQL query:', error);
      // Fallback query generation
      return {
        sql: this.generateFallbackQuery(prompt, context),
        confidence: 0.5,
        explanation: "Fallback query generated due to AI service error"
      };
    }
  }

  private generateFallbackQuery(prompt: string, context: QueryContext): string {
    const mainTable = context.tables[0];
    if (!mainTable) {
      return "SELECT 1 as result";
    }

    const columns = mainTable.columns.slice(0, 5).map(col => `${mainTable.name}.${col.name}`);
    let sql = `SELECT ${columns.join(', ')} FROM ${mainTable.name}`;

    // Add simple joins if relationships exist
    for (const rel of context.relationships.slice(0, 2)) {
      if (rel.leftTable === mainTable.name) {
        sql += ` ${rel.joinType.toUpperCase()} JOIN ${rel.rightTable} ON ${rel.leftTable}.${rel.leftColumn} = ${rel.rightTable}.${rel.rightColumn}`;
      }
    }

    sql += " LIMIT 100";
    return sql;
  }

  private async validateQuery(sql: string, context: QueryContext): Promise<{
    isValid: boolean;
    hasWarnings: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let hasWarnings = false;

    // Basic SQL syntax validation
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      errors.push('Query must be a SELECT statement');
    }

    // Check if referenced tables exist in context
    const referencedTables = this.extractTablesFromSQL(sql);
    const availableTables = context.tables.map(t => t.name);
    
    for (const table of referencedTables) {
      if (!availableTables.includes(table)) {
        errors.push(`Referenced table '${table}' not found in available tables`);
      }
    }

    // Check for potential performance issues
    if (!sql.toUpperCase().includes('LIMIT') && !sql.toUpperCase().includes('WHERE')) {
      hasWarnings = true;
      errors.push('Warning: Query may return large result set. Consider adding LIMIT or WHERE clause');
    }

    return {
      isValid: errors.filter(e => !e.startsWith('Warning:')).length === 0,
      hasWarnings,
      errors
    };
  }

  private extractTablesFromSQL(sql: string): string[] {
    const tables: string[] = [];
    const upperSQL = sql.toUpperCase();
    
    // Simple regex to extract table names (this could be more sophisticated)
    const fromMatch = upperSQL.match(/FROM\s+(\w+)/g);
    const joinMatches = upperSQL.match(/JOIN\s+(\w+)/g);
    
    if (fromMatch) {
      fromMatch.forEach(match => {
        const table = match.replace(/FROM\s+/, '');
        tables.push(table);
      });
    }
    
    if (joinMatches) {
      joinMatches.forEach(match => {
        const table = match.replace(/JOIN\s+/, '');
        tables.push(table);
      });
    }
    
    return [...new Set(tables)];
  }

  private calculateComplexity(sql: string, context: QueryContext): 'simple' | 'medium' | 'complex' {
    const upperSQL = sql.toUpperCase();
    let score = 0;

    // Count joins
    const joinCount = (upperSQL.match(/JOIN/g) || []).length;
    score += joinCount * 2;

    // Count subqueries
    const subqueryCount = (upperSQL.match(/\(/g) || []).length;
    score += subqueryCount * 3;

    // Count aggregations
    const aggCount = (upperSQL.match(/(COUNT|SUM|AVG|MAX|MIN|GROUP BY)/g) || []).length;
    score += aggCount * 2;

    // Count conditions
    const conditionCount = (upperSQL.match(/(WHERE|HAVING|CASE)/g) || []).length;
    score += conditionCount;

    if (score <= 3) return 'simple';
    if (score <= 8) return 'medium';
    return 'complex';
  }

  private async saveGeneratedQuery(prompt: string, result: GeneratedQueryResult): Promise<void> {
    try {
      await this.prisma.generatedQuery.create({
        data: {
          prompt,
          sql: result.sql,
          confidence: result.confidence,
          tablesUsed: result.tablesUsed,
          joinTypes: result.joinTypes,
          complexity: result.complexity,
          templateUsed: result.templateUsed,
          validationStatus: result.validationStatus,
          validationErrors: result.validationErrors || []
        }
      });
    } catch (error) {
      console.error('Error saving generated query:', error);
      // Don't throw error here as it's not critical for the main functionality
    }
  }

  async executeQuery(sql: string): Promise<{ results: any[]; executionTime: number; rowCount: number }> {
    const startTime = Date.now();
    
    try {
      const results = await this.prisma.$queryRawUnsafe(sql);
      const executionTime = Date.now() - startTime;
      const rowCount = Array.isArray(results) ? results.length : 0;
      
      return {
        results: Array.isArray(results) ? results : [results],
        executionTime,
        rowCount
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('Error executing query:', error);
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getQueryHistory(limit: number = 10): Promise<any[]> {
    return await this.prisma.generatedQuery.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        prompt: true,
        sql: true,
        confidence: true,
        complexity: true,
        validationStatus: true,
        createdAt: true
      }
    });
  }
}