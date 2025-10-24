import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { TableStructure } from "./extractor.js";

export interface FieldStructure {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencedTable?: string;
  referencedField?: string;
}

export interface ColumnAnalysis {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencedTable?: string;
  referencedColumn?: string;
  
  // Semantic analysis
  semanticType: string;
  businessContext: string;
  description: string;
  embedding: number[];
  
  // Sample data analysis
  sampleValues: any[];
  valuePatterns: {
    format?: string;
    minLength?: number;
    maxLength?: number;
    numericRange?: { min: number; max: number };
    commonPrefixes?: string[];
    dateFormat?: string;
    enumValues?: string[];
  };
  uniqueValueCount: number;
  nullPercentage: number;
  
  // Relationship hints
  possibleJoinKeys: Array<{
    targetTable: string;
    targetColumn: string;
    confidence: number;
    reason: string;
  }>;
  semanticSimilarity: Array<{
    table: string;
    column: string;
    similarity: number;
  }>;
}

export class ColumnAnalyzer {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeAllColumns(tableStructures: TableStructure[]): Promise<ColumnAnalysis[]> {
    const analyses: ColumnAnalysis[] = [];

    for (const table of tableStructures) {
      for (const field of table.fields) {
        const analysis = await this.analyzeColumn(table, field, table.sampleData || []);
        analyses.push(analysis);
      }
    }

    return analyses;
  }

  async analyzeColumn(
    table: TableStructure, 
    field: FieldStructure, 
    sampleData: any[]
  ): Promise<ColumnAnalysis> {
    // Extract sample values for this column
    const sampleValues = this.extractSampleValues(sampleData, field.name);
    
    // Analyze value patterns
    const valuePatterns = this.analyzeValuePatterns(sampleValues, field.type);
    
    // Calculate statistics
    const uniqueValueCount = new Set(sampleValues.filter(v => v !== null && v !== undefined)).size;
    const nullCount = sampleValues.filter(v => v === null || v === undefined).length;
    const nullPercentage = sampleData.length > 0 ? (nullCount / sampleData.length) * 100 : 0;
    
    // Generate semantic analysis using AI
    const semanticAnalysis = await this.generateSemanticAnalysis(
      table.tableName, 
      field, 
      sampleValues, 
      valuePatterns
    );
    
    // Generate embedding for semantic search
    const embedding = await this.generateEmbedding(semanticAnalysis.description);
    
    // Find possible join keys
    const possibleJoinKeys = this.findPossibleJoinKeys(field, sampleValues);
    
    return {
      tableName: table.tableName,
      columnName: field.name,
      dataType: field.type,
      isNullable: field.nullable,
      isPrimaryKey: field.isPrimaryKey,
      isForeignKey: field.isForeignKey,
      referencedTable: field.referencedTable,
      referencedColumn: field.referencedField,
      
      semanticType: semanticAnalysis.semanticType,
      businessContext: semanticAnalysis.businessContext,
      description: semanticAnalysis.description,
      embedding,
      
      sampleValues: sampleValues.slice(0, 10), // Store first 10 samples
      valuePatterns,
      uniqueValueCount,
      nullPercentage,
      
      possibleJoinKeys,
      semanticSimilarity: [] // Will be populated later by comparing embeddings
    };
  }

  private extractSampleValues(sampleData: any[], columnName: string): any[] {
    return sampleData.map(row => row[columnName]).filter(value => value !== undefined);
  }

  private analyzeValuePatterns(values: any[], dataType: string): any {
    const patterns: any = {};
    
    if (values.length === 0) return patterns;
    
    // String analysis
    if (dataType.includes('VARCHAR') || dataType.includes('CHAR')) {
      const stringValues = values.filter(v => typeof v === 'string');
      if (stringValues.length > 0) {
        patterns.minLength = Math.min(...stringValues.map(s => s.length));
        patterns.maxLength = Math.max(...stringValues.map(s => s.length));
        
        // Check for common prefixes
        const prefixes = this.findCommonPrefixes(stringValues);
        if (prefixes.length > 0) {
          patterns.commonPrefixes = prefixes;
        }
        
        // Check if it looks like an enum
        const uniqueValues = [...new Set(stringValues)];
        if (uniqueValues.length <= 20 && uniqueValues.length < stringValues.length * 0.5) {
          patterns.enumValues = uniqueValues;
        }
      }
    }
    
    // Numeric analysis
    if (dataType.includes('INT') || dataType.includes('DECIMAL') || dataType.includes('FLOAT')) {
      const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
      if (numericValues.length > 0) {
        patterns.numericRange = {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues)
        };
      }
    }
    
    // Date analysis
    if (dataType.includes('DATE') || dataType.includes('TIMESTAMP')) {
      const dateValues = values.filter(v => v instanceof Date || typeof v === 'string');
      if (dateValues.length > 0) {
        // Try to detect date format
        const sampleDate = dateValues[0];
        if (typeof sampleDate === 'string') {
          patterns.dateFormat = this.detectDateFormat(sampleDate);
        }
      }
    }
    
    return patterns;
  }

  private findCommonPrefixes(strings: string[]): string[] {
    const prefixCounts = new Map<string, number>();
    
    for (const str of strings) {
      for (let i = 1; i <= Math.min(str.length, 5); i++) {
        const prefix = str.substring(0, i);
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }
    
    return Array.from(prefixCounts.entries())
      .filter(([_, count]) => count >= strings.length * 0.3) // At least 30% of values
      .map(([prefix, _]) => prefix)
      .sort((a, b) => b.length - a.length) // Longer prefixes first
      .slice(0, 3);
  }

  private detectDateFormat(dateString: string): string {
    const formats = [
      { pattern: /^\d{4}-\d{2}-\d{2}$/, format: 'YYYY-MM-DD' },
      { pattern: /^\d{2}\/\d{2}\/\d{4}$/, format: 'MM/DD/YYYY' },
      { pattern: /^\d{2}-\d{2}-\d{4}$/, format: 'MM-DD-YYYY' },
      { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, format: 'ISO 8601' }
    ];
    
    for (const { pattern, format } of formats) {
      if (pattern.test(dateString)) {
        return format;
      }
    }
    
    return 'Unknown';
  }

  private async generateSemanticAnalysis(
    tableName: string, 
    field: FieldStructure, 
    sampleValues: any[], 
    patterns: any
  ): Promise<{
    semanticType: string;
    businessContext: string;
    description: string;
  }> {
    const prompt = `Analyze this database column and provide semantic information:

Table: ${tableName}
Column: ${field.name}
Data Type: ${field.type}
Is Primary Key: ${field.isPrimaryKey}
Is Foreign Key: ${field.isForeignKey}
${field.referencedTable ? `References: ${field.referencedTable}.${field.referencedField}` : ''}

Sample Values: ${JSON.stringify(sampleValues.slice(0, 5))}
Value Patterns: ${JSON.stringify(patterns)}

Based on this information, provide:
1. Semantic Type: Choose from [identifier, name, description, date, amount, quantity, status, code, address, phone, email, url, category, other]
2. Business Context: What this column represents in business terms (1-2 sentences)
3. Description: A detailed description of what this column contains and how it's used

Respond in JSON format:
{
  "semanticType": "...",
  "businessContext": "...",
  "description": "..."
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return JSON.parse(content);
    } catch (error) {
      console.error(`Error analyzing column ${tableName}.${field.name}:`, error);
      
      // Fallback analysis
      return {
        semanticType: this.inferSemanticType(field.name, field.type, sampleValues),
        businessContext: `Column ${field.name} in table ${tableName}`,
        description: `${field.type} column containing ${field.name} data`
      };
    }
  }

  private inferSemanticType(columnName: string, dataType: string, sampleValues: any[]): string {
    const name = columnName.toLowerCase();
    
    // Common patterns
    if (name.includes('id') || name.includes('nr') || name.includes('num')) return 'identifier';
    if (name.includes('name') || name.includes('title')) return 'name';
    if (name.includes('desc') || name.includes('text')) return 'description';
    if (name.includes('date') || name.includes('time') || dataType.includes('DATE')) return 'date';
    if (name.includes('amount') || name.includes('price') || name.includes('cost')) return 'amount';
    if (name.includes('qty') || name.includes('quantity') || name.includes('count')) return 'quantity';
    if (name.includes('status') || name.includes('state')) return 'status';
    if (name.includes('code') || name.includes('type')) return 'code';
    if (name.includes('addr') || name.includes('address')) return 'address';
    if (name.includes('phone') || name.includes('tel')) return 'phone';
    if (name.includes('email') || name.includes('mail')) return 'email';
    if (name.includes('url') || name.includes('link')) return 'url';
    if (name.includes('cat') || name.includes('class') || name.includes('group')) return 'category';
    
    return 'other';
  }

  private findPossibleJoinKeys(field: FieldStructure, sampleValues: any[]): Array<{
    targetTable: string;
    targetColumn: string;
    confidence: number;
    reason: string;
  }> {
    const joinKeys: Array<{
      targetTable: string;
      targetColumn: string;
      confidence: number;
      reason: string;
    }> = [];

    // If it's already a foreign key, add it with high confidence
    if (field.isForeignKey && field.referencedTable && field.referencedField) {
      joinKeys.push({
        targetTable: field.referencedTable,
        targetColumn: field.referencedField,
        confidence: 0.95,
        reason: 'Explicit foreign key relationship'
      });
    }

    // Look for naming patterns that suggest relationships
    const fieldName = field.name.toLowerCase();
    
    // Common SAP patterns
    if (fieldName === 'kunnr') {
      joinKeys.push({
        targetTable: 'KNA1',
        targetColumn: 'KUNNR',
        confidence: 0.9,
        reason: 'SAP customer number pattern'
      });
    }
    
    if (fieldName === 'matnr') {
      joinKeys.push({
        targetTable: 'MARA',
        targetColumn: 'MATNR',
        confidence: 0.9,
        reason: 'SAP material number pattern'
      });
    }
    
    if (fieldName === 'vbeln') {
      joinKeys.push({
        targetTable: 'VBAK',
        targetColumn: 'VBELN',
        confidence: 0.9,
        reason: 'SAP sales document number pattern'
      });
    }

    return joinKeys;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  async saveColumnAnalyses(analyses: ColumnAnalysis[]): Promise<void> {
    for (const analysis of analyses) {
      await this.prisma.columnMetadata.upsert({
        where: {
          tableName_columnName: {
            tableName: analysis.tableName,
            columnName: analysis.columnName
          }
        },
        update: {
          dataType: analysis.dataType,
          isNullable: analysis.isNullable,
          isPrimaryKey: analysis.isPrimaryKey,
          isForeignKey: analysis.isForeignKey,
          referencedTable: analysis.referencedTable,
          referencedColumn: analysis.referencedColumn,
          semanticType: analysis.semanticType,
          businessContext: analysis.businessContext,
          description: analysis.description,
          // embedding: `[${analysis.embedding.join(',')}]`, // Skip embedding for now due to Prisma vector type issues
          sampleValues: analysis.sampleValues,
          valuePatterns: analysis.valuePatterns,
          uniqueValueCount: analysis.uniqueValueCount,
          nullPercentage: analysis.nullPercentage,
          possibleJoinKeys: analysis.possibleJoinKeys,
          semanticSimilarity: analysis.semanticSimilarity
        },
        create: {
          tableName: analysis.tableName,
          columnName: analysis.columnName,
          dataType: analysis.dataType,
          isNullable: analysis.isNullable,
          isPrimaryKey: analysis.isPrimaryKey,
          isForeignKey: analysis.isForeignKey,
          referencedTable: analysis.referencedTable,
          referencedColumn: analysis.referencedColumn,
          semanticType: analysis.semanticType,
          businessContext: analysis.businessContext,
          description: analysis.description,
          // embedding: `[${analysis.embedding.join(',')}]`, // Skip embedding for now due to Prisma vector type issues
          sampleValues: analysis.sampleValues,
          valuePatterns: analysis.valuePatterns,
          uniqueValueCount: analysis.uniqueValueCount,
          nullPercentage: analysis.nullPercentage,
          possibleJoinKeys: analysis.possibleJoinKeys,
          semanticSimilarity: analysis.semanticSimilarity
        }
      });
    }
  }

  async findSimilarColumns(
    queryText: string, 
    limit: number = 5
  ): Promise<Array<{
    tableName: string;
    columnName: string;
    description: string;
    semanticType: string;
    similarity: number;
  }>> {
    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(queryText);
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<Array<{
      tableName: string;
      columnName: string;
      description: string;
      semanticType: string;
      similarity: number;
    }>>`
      SELECT 
        "tableName",
        "columnName",
        description,
        "semanticType",
        1 - (embedding <=> ${embeddingString}::vector) as similarity
      FROM "ColumnMetadata"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;

    return results;
  }
}