import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

export interface InferredRelationship {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  relationshipType: 'one_to_one' | 'one_to_many' | 'many_to_many';
  joinType: 'inner' | 'left' | 'right' | 'full';
  confidence: number;
  inferenceMethod: 'column_name' | 'data_pattern' | 'business_logic' | 'ai_analysis';
  businessRules?: string;
  evidence: string[];
}

export interface RelationshipPattern {
  pattern: string;
  confidence: number;
  joinType: 'inner' | 'left' | 'right' | 'full';
  description: string;
}

export class RelationshipInference {
  private openai: OpenAI;
  
  // Common SAP relationship patterns
  private readonly sapPatterns: RelationshipPattern[] = [
    { pattern: 'KUNNR', confidence: 0.95, joinType: 'left', description: 'Customer number - links customer master to transactions' },
    { pattern: 'MATNR', confidence: 0.95, joinType: 'left', description: 'Material number - links material master to transactions' },
    { pattern: 'VBELN', confidence: 0.90, joinType: 'inner', description: 'Sales document number - links header to items' },
    { pattern: 'BUKRS', confidence: 0.85, joinType: 'left', description: 'Company code - organizational unit' },
    { pattern: 'WERKS', confidence: 0.85, joinType: 'left', description: 'Plant - organizational unit' },
    { pattern: 'LGORT', confidence: 0.80, joinType: 'left', description: 'Storage location' },
    { pattern: 'MANDT', confidence: 0.99, joinType: 'inner', description: 'Client - system partition key' }
  ];

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async inferAllRelationships(): Promise<InferredRelationship[]> {
    console.log('Starting relationship inference...');
    
    // Get all tables and their columns
    const tables = await this.getAllTablesWithColumns();
    const relationships: InferredRelationship[] = [];

    // Method 1: Column name matching
    const nameBasedRelationships = await this.inferByColumnNames(tables);
    relationships.push(...nameBasedRelationships);

    // Method 2: Data pattern analysis
    const patternBasedRelationships = await this.inferByDataPatterns(tables);
    relationships.push(...patternBasedRelationships);

    // Method 3: Business logic rules
    const businessLogicRelationships = await this.inferByBusinessLogic(tables);
    relationships.push(...businessLogicRelationships);

    // Method 4: AI-powered analysis
    const aiBasedRelationships = await this.inferByAIAnalysis(tables);
    relationships.push(...aiBasedRelationships);

    // Deduplicate and rank relationships
    const uniqueRelationships = this.deduplicateRelationships(relationships);
    
    // Save to database
    await this.saveInferredRelationships(uniqueRelationships);

    console.log(`Inferred ${uniqueRelationships.length} relationships`);
    return uniqueRelationships;
  }

  private async getAllTablesWithColumns(): Promise<Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      semanticType?: string;
      sampleValues?: string[];
      uniqueValueCount?: number;
      nullPercentage?: number;
    }>;
  }>> {
    try {
      // Get unique table names from ColumnMetadata
      const tableNames = await this.prisma.columnMetadata.findMany({
        select: { tableName: true },
        distinct: ['tableName']
      });

      const tables = [];
      for (const { tableName } of tableNames) {
        const columns = await this.prisma.columnMetadata.findMany({
          where: { tableName },
          select: {
            columnName: true,
            dataType: true,
            semanticType: true,
            sampleValues: true,
            uniqueValueCount: true,
            nullPercentage: true
          }
        });

        tables.push({
          name: tableName,
          columns: columns.map(col => ({
            name: col.columnName,
            type: col.dataType,
            semanticType: col.semanticType || undefined,
            sampleValues: Array.isArray(col.sampleValues) ? col.sampleValues as string[] : undefined,
            uniqueValueCount: col.uniqueValueCount || undefined,
            nullPercentage: col.nullPercentage || undefined
          }))
        });
      }

      return tables;
    } catch (error) {
      console.error('Error getting tables with columns:', error);
      // Fallback to basic SAP structure
      return [
        {
          name: 'KNA1',
          columns: [
            { name: 'KUNNR', type: 'VARCHAR(10)', semanticType: 'identifier' },
            { name: 'NAME1', type: 'VARCHAR(35)', semanticType: 'name' },
            { name: 'MANDT', type: 'VARCHAR(3)', semanticType: 'client' }
          ]
        },
        {
          name: 'MARA',
          columns: [
            { name: 'MATNR', type: 'VARCHAR(18)', semanticType: 'identifier' },
            { name: 'MTART', type: 'VARCHAR(4)', semanticType: 'type' },
            { name: 'MANDT', type: 'VARCHAR(3)', semanticType: 'client' }
          ]
        },
        {
          name: 'VBAK',
          columns: [
            { name: 'VBELN', type: 'VARCHAR(10)', semanticType: 'identifier' },
            { name: 'KUNNR', type: 'VARCHAR(10)', semanticType: 'identifier' },
            { name: 'MANDT', type: 'VARCHAR(3)', semanticType: 'client' }
          ]
        },
        {
          name: 'VBAP',
          columns: [
            { name: 'VBELN', type: 'VARCHAR(10)', semanticType: 'identifier' },
            { name: 'POSNR', type: 'VARCHAR(6)', semanticType: 'position' },
            { name: 'MATNR', type: 'VARCHAR(18)', semanticType: 'identifier' },
            { name: 'MANDT', type: 'VARCHAR(3)', semanticType: 'client' }
          ]
        }
      ];
    }
  }

  private async inferByColumnNames(tables: any[]): Promise<InferredRelationship[]> {
    const relationships: InferredRelationship[] = [];

    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const table1 = tables[i];
        const table2 = tables[j];

        // Check for exact column name matches
        for (const col1 of table1.columns) {
          for (const col2 of table2.columns) {
            if (col1.name === col2.name && this.isLikelyForeignKey(col1.name)) {
              const pattern = this.sapPatterns.find((p: RelationshipPattern) => col1.name.includes(p.pattern));
              const confidence = pattern ? pattern.confidence : 0.7;
              const joinType = pattern ? pattern.joinType : 'left';

              relationships.push({
                leftTable: table1.name,
                leftColumn: col1.name,
                rightTable: table2.name,
                rightColumn: col2.name,
                relationshipType: this.inferRelationshipType(col1, col2),
                joinType,
                confidence,
                inferenceMethod: 'column_name',
                evidence: [`Exact column name match: ${col1.name}`, pattern ? pattern.description : 'Common identifier pattern']
              });
            }
          }
        }

        // Check for semantic matches (similar column names)
        for (const col1 of table1.columns) {
          for (const col2 of table2.columns) {
            if (col1.name !== col2.name && this.areColumnsSemanticallyRelated(col1.name, col2.name)) {
              relationships.push({
                leftTable: table1.name,
                leftColumn: col1.name,
                rightTable: table2.name,
                rightColumn: col2.name,
                relationshipType: this.inferRelationshipType(col1, col2),
                joinType: 'left',
                confidence: 0.6,
                inferenceMethod: 'column_name',
                evidence: [`Semantic column name similarity: ${col1.name} ~ ${col2.name}`]
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private async inferByDataPatterns(tables: any[]): Promise<InferredRelationship[]> {
    const relationships: InferredRelationship[] = [];

    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const table1 = tables[i];
        const table2 = tables[j];

        for (const col1 of table1.columns) {
          for (const col2 of table2.columns) {
            if (col1.sampleValues && col2.sampleValues) {
              const overlap = this.calculateValueOverlap(col1.sampleValues, col2.sampleValues);
              
              if (overlap > 0.3) { // 30% overlap threshold
                const confidence = Math.min(0.8, overlap);
                
                relationships.push({
                  leftTable: table1.name,
                  leftColumn: col1.name,
                  rightTable: table2.name,
                  rightColumn: col2.name,
                  relationshipType: this.inferRelationshipTypeFromData(col1, col2),
                  joinType: 'left',
                  confidence,
                  inferenceMethod: 'data_pattern',
                  evidence: [`Value overlap: ${(overlap * 100).toFixed(1)}%`]
                });
              }
            }
          }
        }
      }
    }

    return relationships;
  }

  private async inferByBusinessLogic(tables: any[]): Promise<InferredRelationship[]> {
    const relationships: InferredRelationship[] = [];

    // SAP-specific business logic rules
    const businessRules = [
      {
        condition: (t1: string, t2: string) => t1 === 'VBAK' && t2 === 'KNA1',
        leftColumn: 'KUNNR',
        rightColumn: 'KUNNR',
        joinType: 'left' as const,
        confidence: 0.95,
        rule: 'Sales header always references customer master'
      },
      {
        condition: (t1: string, t2: string) => t1 === 'VBAP' && t2 === 'VBAK',
        leftColumn: 'VBELN',
        rightColumn: 'VBELN',
        joinType: 'inner' as const,
        confidence: 0.98,
        rule: 'Sales items always belong to a sales header'
      },
      {
        condition: (t1: string, t2: string) => t1 === 'VBAP' && t2 === 'MARA',
        leftColumn: 'MATNR',
        rightColumn: 'MATNR',
        joinType: 'left' as const,
        confidence: 0.90,
        rule: 'Sales items reference material master'
      }
    ];

    for (const table1 of tables) {
      for (const table2 of tables) {
        if (table1.name === table2.name) continue;

        for (const rule of businessRules) {
          if (rule.condition(table1.name, table2.name)) {
            const leftCol = table1.columns.find((c: { name: string }) => c.name === rule.leftColumn);
            const rightCol = table2.columns.find((c: { name: string }) => c.name === rule.rightColumn);

            if (leftCol && rightCol) {
              relationships.push({
                leftTable: table1.name,
                leftColumn: rule.leftColumn,
                rightTable: table2.name,
                rightColumn: rule.rightColumn,
                relationshipType: 'one_to_many',
                joinType: rule.joinType,
                confidence: rule.confidence,
                inferenceMethod: 'business_logic',
                businessRules: rule.rule,
                evidence: [`Business rule: ${rule.rule}`]
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private async inferByAIAnalysis(tables: any[]): Promise<InferredRelationship[]> {
    if (tables.length < 2) return [];

    try {
      const prompt = `Analyze these database tables and infer potential relationships:

${tables.map(table => `
Table: ${table.name}
Columns: ${table.columns.map(col => `${col.name} (${col.type}${col.semanticType ? `, semantic: ${col.semanticType}` : ''})`).join(', ')}
`).join('\n')}

Identify potential foreign key relationships based on:
1. Column name patterns
2. Data types compatibility
3. Business logic (this appears to be an SAP-like system)
4. Semantic meaning of columns

For each relationship, provide:
- Left table and column
- Right table and column
- Relationship type (one_to_one, one_to_many, many_to_many)
- Join type (inner, left, right, full)
- Confidence (0.0 to 1.0)
- Brief explanation

Respond in JSON format:
{
  "relationships": [
    {
      "leftTable": "...",
      "leftColumn": "...",
      "rightTable": "...",
      "rightColumn": "...",
      "relationshipType": "...",
      "joinType": "...",
      "confidence": 0.85,
      "explanation": "..."
    }
  ]
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const result = JSON.parse(content);
      
      return result.relationships.map((rel: any) => ({
        leftTable: rel.leftTable,
        leftColumn: rel.leftColumn,
        rightTable: rel.rightTable,
        rightColumn: rel.rightColumn,
        relationshipType: rel.relationshipType,
        joinType: rel.joinType,
        confidence: rel.confidence,
        inferenceMethod: 'ai_analysis' as const,
        evidence: [rel.explanation]
      }));

    } catch (error) {
      console.error('Error in AI relationship analysis:', error);
      return [];
    }
  }

  private isLikelyForeignKey(columnName: string): boolean {
    const fkPatterns = ['KUNNR', 'MATNR', 'VBELN', 'BUKRS', 'WERKS', 'MANDT'];
    return fkPatterns.some(pattern => columnName.includes(pattern));
  }

  private areColumnsSemanticallyRelated(col1: string, col2: string): boolean {
    // Simple semantic similarity check
    const similarity = this.calculateStringSimilarity(col1, col2);
    return similarity > 0.7;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private calculateValueOverlap(values1: string[], values2: string[]): number {
    const set1 = new Set(values1);
    const set2 = new Set(values2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private inferRelationshipType(col1: { uniqueValueCount?: number; sampleValues?: string[] }, col2: { uniqueValueCount?: number; sampleValues?: string[] }): 'one_to_one' | 'one_to_many' | 'many_to_many' {
    // Simple heuristic based on uniqueness
    if (col1.uniqueValueCount && col2.uniqueValueCount) {
      const ratio1 = col1.uniqueValueCount / (col1.sampleValues?.length || 1);
      const ratio2 = col2.uniqueValueCount / (col2.sampleValues?.length || 1);
      
      if (ratio1 > 0.9 && ratio2 > 0.9) return 'one_to_one';
      if (ratio1 > 0.9 || ratio2 > 0.9) return 'one_to_many';
    }
    
    return 'one_to_many'; // Default assumption
  }

  private inferRelationshipTypeFromData(col1: { uniqueValueCount?: number; sampleValues?: string[] }, col2: { uniqueValueCount?: number; sampleValues?: string[] }): 'one_to_one' | 'one_to_many' | 'many_to_many' {
    return this.inferRelationshipType(col1, col2);
  }

  private deduplicateRelationships(relationships: InferredRelationship[]): InferredRelationship[] {
    const uniqueMap = new Map<string, InferredRelationship>();

    for (const rel of relationships) {
      const key = `${rel.leftTable}.${rel.leftColumn}-${rel.rightTable}.${rel.rightColumn}`;
      const reverseKey = `${rel.rightTable}.${rel.rightColumn}-${rel.leftTable}.${rel.leftColumn}`;
      
      const existing = uniqueMap.get(key) || uniqueMap.get(reverseKey);
      
      if (!existing || rel.confidence > existing.confidence) {
        uniqueMap.set(key, rel);
        uniqueMap.delete(reverseKey); // Remove reverse if it exists
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private async saveInferredRelationships(relationships: InferredRelationship[]): Promise<void> {
    try {
      // Clear existing inferred relationships (we'll use relationshipType to identify inferred ones)
      await this.prisma.tableRelationship.deleteMany({
        where: {
          relationshipType: {
            in: ['inferred', 'semantic_match']
          }
        }
      });

      // Insert new relationships
      for (const rel of relationships) {
        await this.prisma.tableRelationship.create({
          data: {
            leftTable: rel.leftTable,
            leftColumn: rel.leftColumn,
            rightTable: rel.rightTable,
            rightColumn: rel.rightColumn,
            relationshipType: 'inferred', // Use schema field
            joinType: rel.joinType,
            confidence: rel.confidence,
            businessRule: rel.businessRules || `${rel.inferenceMethod}: ${rel.evidence.join(', ')}`
          }
        });
      }

      console.log(`Saved ${relationships.length} inferred relationships to database`);
    } catch (error) {
      console.error('Error saving inferred relationships:', error);
    }
  }

  async getRelationshipsForTables(tableNames: string[]): Promise<InferredRelationship[]> {
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
        relationshipType: rel.relationshipType as 'one_to_one' | 'one_to_many' | 'many_to_many',
        joinType: rel.joinType as 'inner' | 'left' | 'right' | 'full',
        confidence: rel.confidence,
        inferenceMethod: rel.inferenceMethod as 'column_name' | 'data_pattern' | 'business_logic' | 'ai_analysis',
        businessRules: rel.businessRules || undefined,
        evidence: rel.evidence || []
      }));
    } catch (error) {
      console.error('Error getting relationships for tables:', error);
      return [];
    }
  }

  async analyzeRelationshipQuality(): Promise<{
    totalRelationships: number;
    byMethod: Record<string, number>;
    byConfidence: Record<string, number>;
    averageConfidence: number;
  }> {
    try {
      const relationships = await this.prisma.tableRelationship.findMany();
      
      const byMethod: Record<string, number> = {};
      const byConfidence: Record<string, number> = {
        'high (>0.8)': 0,
        'medium (0.6-0.8)': 0,
        'low (<0.6)': 0
      };
      
      let totalConfidence = 0;
      
      for (const rel of relationships) {
        byMethod[rel.inferenceMethod] = (byMethod[rel.inferenceMethod] || 0) + 1;
        totalConfidence += rel.confidence;
        
        if (rel.confidence > 0.8) byConfidence['high (>0.8)']++;
        else if (rel.confidence >= 0.6) byConfidence['medium (0.6-0.8)']++;
        else byConfidence['low (<0.6)']++;
      }
      
      return {
        totalRelationships: relationships.length,
        byMethod,
        byConfidence,
        averageConfidence: relationships.length > 0 ? totalConfidence / relationships.length : 0
      };
    } catch (error) {
      console.error('Error analyzing relationship quality:', error);
      return {
        totalRelationships: 0,
        byMethod: {},
        byConfidence: {},
        averageConfidence: 0
      };
    }
  }
}