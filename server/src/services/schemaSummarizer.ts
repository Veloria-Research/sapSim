import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { TableStructure } from "./extractor.js";

export interface SchemaSummary {
  tableName: string;
  summary: string;
  embedding: number[];
  businessContext: string;
  keyFields: string[];
  relationships: string[];
}

export class SchemaSummarizerAgent {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateSchemaSummary(tableStructure: TableStructure): Promise<SchemaSummary> {
    // Generate semantic summary using OpenAI
    const summary = await this.generateSemanticSummary(tableStructure);
    
    // Generate embedding for the summary
    const embedding = await this.generateEmbedding(summary);
    
    // Extract business context and relationships
    const businessContext = this.extractBusinessContext(tableStructure);
    const keyFields = this.extractKeyFields(tableStructure);
    const relationships = this.extractRelationships(tableStructure);

    return {
      tableName: tableStructure.tableName,
      summary,
      embedding,
      businessContext,
      keyFields,
      relationships
    };
  }

  private async generateSemanticSummary(tableStructure: TableStructure): Promise<string> {
    const prompt = `
Analyze this SAP table structure and provide a comprehensive semantic summary:

Table: ${tableStructure.tableName}
Fields: ${tableStructure.fields.map(f => `${f.name} (${f.type}${f.nullable ? ', nullable' : ''}${f.isPrimaryKey ? ', primary key' : ''}${f.isForeignKey ? `, foreign key to ${f.referencedTable}.${f.referencedField}` : ''})`).join(', ')}

Sample Data:
${JSON.stringify(tableStructure.sampleData.slice(0, 3), null, 2)}

Record Count: ${tableStructure.recordCount}

Please provide:
1. Business purpose of this table
2. Key business entities it represents
3. Main use cases and business processes
4. Data quality and completeness observations
5. Relationships to other business entities

Keep the summary concise but comprehensive, focusing on business meaning rather than technical details.
`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert SAP business analyst. Provide clear, business-focused summaries of SAP table structures."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    return response.choices[0]?.message?.content || "No summary generated";
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  }

  private extractBusinessContext(tableStructure: TableStructure): string {
    const contextMap: Record<string, string> = {
      'MARA': 'Material Master - Core product/material information for inventory and sales',
      'KNA1': 'Customer Master - Customer demographic and contact information',
      'VBAK': 'Sales Document Header - Sales order header information and customer assignments',
      'VBAP': 'Sales Document Items - Individual line items within sales orders'
    };

    return contextMap[tableStructure.tableName] || 'Unknown business context';
  }

  private extractKeyFields(tableStructure: TableStructure): string[] {
    return tableStructure.fields
      .filter(field => field.isPrimaryKey || field.isForeignKey || field.name.includes('DATE') || field.name.includes('NUM'))
      .map(field => field.name);
  }

  private extractRelationships(tableStructure: TableStructure): string[] {
    return tableStructure.fields
      .filter(field => field.isForeignKey)
      .map(field => `${field.name} -> ${field.referencedTable}.${field.referencedField}`);
  }

  async saveSchemaSummary(schemaSummary: SchemaSummary): Promise<void> {
    // Convert embedding array to the format expected by pgvector
    const embeddingString = `[${schemaSummary.embedding.join(',')}]`;

    await this.prisma.$executeRaw`
      INSERT INTO "SchemaSummary" (id, "table", summary, embedding, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${schemaSummary.tableName},
        ${schemaSummary.summary},
        ${embeddingString}::vector,
        NOW(),
        NOW()
      )
      ON CONFLICT ("table") DO UPDATE SET
        summary = EXCLUDED.summary,
        embedding = EXCLUDED.embedding,
        "updatedAt" = NOW()
    `;
  }

  async findSimilarSchemas(queryText: string, limit: number = 5): Promise<Array<{
    tableName: string;
    summary: string;
    similarity: number;
  }>> {
    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(queryText);
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<Array<{
      table: string;
      summary: string;
      similarity: number;
    }>>`
      SELECT 
        "table",
        summary,
        1 - (embedding <=> ${embeddingString}::vector) as similarity
      FROM "SchemaSummary"
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;

    return results.map(result => ({
      tableName: result.table,
      summary: result.summary,
      similarity: result.similarity
    }));
  }

  async processAllTables(tableStructures: TableStructure[]): Promise<SchemaSummary[]> {
    const summaries: SchemaSummary[] = [];

    for (const tableStructure of tableStructures) {
      console.log(`Processing schema summary for table: ${tableStructure.tableName}`);
      
      const summary = await this.generateSchemaSummary(tableStructure);
      await this.saveSchemaSummary(summary);
      summaries.push(summary);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return summaries;
  }
}