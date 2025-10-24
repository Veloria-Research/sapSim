import { PrismaClient } from "@prisma/client";
import { TableStructure } from "./extractor.js";

export interface GroundTruthTable {
  key: string[];
  fields: string[];
  delta_by: string | null;
}

export interface GroundTruthJoin {
  left: string;
  right: string;
  type: 'inner' | 'left' | 'right' | 'full';
  confidence: number;
}

export interface GroundTruthGraph {
  version: string;
  tables: Record<string, GroundTruthTable>;
  joins: GroundTruthJoin[];
  metadata: {
    generatedAt: Date;
    totalTables: number;
    totalJoins: number;
    confidence: number;
  };
}

export class GroundTruthBuilder {
  constructor(private prisma: PrismaClient) {}

  async buildGroundTruth(tableStructures: TableStructure[]): Promise<GroundTruthGraph> {
    const tables: Record<string, GroundTruthTable> = {};
    const joins: GroundTruthJoin[] = [];

    // Build table definitions
    for (const tableStructure of tableStructures) {
      tables[tableStructure.tableName] = this.buildTableDefinition(tableStructure);
    }

    // Infer joins between tables
    const inferredJoins = this.inferJoins(tableStructures);
    joins.push(...inferredJoins);

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(joins);

    const groundTruth: GroundTruthGraph = {
      version: `v${Date.now()}`,
      tables,
      joins,
      metadata: {
        generatedAt: new Date(),
        totalTables: Object.keys(tables).length,
        totalJoins: joins.length,
        confidence
      }
    };

    return groundTruth;
  }

  private buildTableDefinition(tableStructure: TableStructure): GroundTruthTable {
    // Extract primary key fields
    const keyFields = tableStructure.fields
      .filter(field => field.isPrimaryKey)
      .map(field => field.name);

    // Extract all field names
    const allFields = tableStructure.fields.map(field => field.name);

    // Determine delta field (usually a date field for change tracking)
    const deltaField = this.findDeltaField(tableStructure);

    return {
      key: keyFields,
      fields: allFields,
      delta_by: deltaField
    };
  }

  private findDeltaField(tableStructure: TableStructure): string | null {
    // Look for common SAP delta fields
    const deltaFieldCandidates = ['LAEDA', 'ERDAT', 'AEDAT', 'CHANGED_ON'];
    
    for (const candidate of deltaFieldCandidates) {
      const field = tableStructure.fields.find(f => f.name === candidate);
      if (field && field.type.includes('DATE')) {
        return candidate;
      }
    }

    // If no specific delta field found, look for any date field
    const dateField = tableStructure.fields.find(f => 
      f.type.includes('DATE') || f.type.includes('TIMESTAMP')
    );

    return dateField?.name || null;
  }

  private inferJoins(tableStructures: TableStructure[]): GroundTruthJoin[] {
    const joins: GroundTruthJoin[] = [];

    // Create a map for quick lookup
    const tableMap = new Map(tableStructures.map(t => [t.tableName, t]));

    for (const table of tableStructures) {
      for (const field of table.fields) {
        if (field.isForeignKey && field.referencedTable && field.referencedField) {
          const referencedTable = tableMap.get(field.referencedTable);
          if (referencedTable) {
            const join = this.createJoin(
              table.tableName,
              field.name,
              field.referencedTable,
              field.referencedField,
              table,
              referencedTable
            );
            joins.push(join);
          }
        }
      }
    }

    return joins;
  }

  private createJoin(
    leftTable: string,
    leftField: string,
    rightTable: string,
    rightField: string,
    leftTableStructure: TableStructure,
    rightTableStructure: TableStructure
  ): GroundTruthJoin {
    // Determine join type based on business logic and field characteristics
    let joinType: 'inner' | 'left' | 'right' | 'full' = 'inner';
    let confidence = 0.9; // High confidence for explicit foreign keys

    // Business logic for join types
    if (leftTable === 'VBAP' && rightTable === 'MARA') {
      // Sales items to materials - left join (not all items may have materials)
      joinType = 'left';
      confidence = 0.85;
    } else if (leftTable === 'VBAP' && rightTable === 'VBAK') {
      // Sales items to sales headers - inner join (items must have headers)
      joinType = 'inner';
      confidence = 0.95;
    } else if (leftTable === 'VBAK' && rightTable === 'KNA1') {
      // Sales headers to customers - left join (some orders might not have customer data)
      joinType = 'left';
      confidence = 0.8;
    }

    return {
      left: `${leftTable}.${leftField}`,
      right: `${rightTable}.${rightField}`,
      type: joinType,
      confidence
    };
  }

  private calculateOverallConfidence(joins: GroundTruthJoin[]): number {
    if (joins.length === 0) return 0;
    
    const totalConfidence = joins.reduce((sum, join) => sum + join.confidence, 0);
    return totalConfidence / joins.length;
  }

  async saveGroundTruth(groundTruth: GroundTruthGraph): Promise<string> {
    const result = await this.prisma.groundTruth.create({
      data: {
        version: groundTruth.version,
        graph: groundTruth as any // Prisma Json type
      }
    });

    return result.id;
  }

  async getLatestGroundTruth(): Promise<GroundTruthGraph | null> {
    const latest = await this.prisma.groundTruth.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    return latest ? (latest.graph as any) : null;
  }

  async getAllGroundTruthVersions(): Promise<Array<{ id: string; version: string; createdAt: Date }>> {
    const versions = await this.prisma.groundTruth.findMany({
      select: {
        id: true,
        version: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return versions;
  }

  // Utility method to validate ground truth integrity
  validateGroundTruth(groundTruth: GroundTruthGraph): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all referenced tables in joins exist
    for (const join of groundTruth.joins) {
      const [leftTable] = join.left.split('.');
      const [rightTable] = join.right.split('.');

      if (!groundTruth.tables[leftTable]) {
        errors.push(`Join references non-existent left table: ${leftTable}`);
      }
      if (!groundTruth.tables[rightTable]) {
        errors.push(`Join references non-existent right table: ${rightTable}`);
      }
    }

    // Check for circular references (basic check)
    const tableConnections = new Map<string, Set<string>>();
    for (const join of groundTruth.joins) {
      const [leftTable] = join.left.split('.');
      const [rightTable] = join.right.split('.');
      
      if (!tableConnections.has(leftTable)) {
        tableConnections.set(leftTable, new Set());
      }
      tableConnections.get(leftTable)!.add(rightTable);
    }

    // Warn about low confidence joins
    const lowConfidenceJoins = groundTruth.joins.filter(join => join.confidence < 0.7);
    if (lowConfidenceJoins.length > 0) {
      warnings.push(`${lowConfidenceJoins.length} joins have confidence below 70%`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}