import { PrismaClient } from "@prisma/client";
import { GroundTruthGraph } from "./groundTruthBuilder.js";

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  joinValidation: {
    validJoins: string[];
    invalidJoins: string[];
    missingJoins: string[];
  };
  tableValidation: {
    validTables: string[];
    invalidTables: string[];
    unusedTables: string[];
  };
  businessLogicValidation: {
    isBusinessLogicValid: boolean;
    businessRuleViolations: string[];
  };
}

export interface QueryAnalysis {
  tables: string[];
  joins: Array<{
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    joinType: string;
  }>;
  columns: string[];
  whereConditions: string[];
  hasAggregation: boolean;
  hasSubqueries: boolean;
}

export class ValidatorAgent {
  constructor(private prisma: PrismaClient) {}

  /**
   * Main validation method that cross-checks generated SQL against ground truth graph
   */
  async validateQuery(
    sql: string, 
    groundTruth: GroundTruthGraph,
    businessContext?: string
  ): Promise<ValidationResult> {
    try {
      // Step 1: Parse the SQL query to extract structure
      const queryAnalysis = this.parseSQL(sql);
      
      // Step 2: Validate joins against ground truth
      const joinValidation = this.validateJoins(queryAnalysis, groundTruth);
      
      // Step 3: Validate table usage
      const tableValidation = this.validateTables(queryAnalysis, groundTruth);
      
      // Step 4: Validate business logic
      const businessLogicValidation = this.validateBusinessLogic(queryAnalysis, businessContext);
      
      // Step 5: Check for SAP-specific best practices
      const sapValidation = this.validateSAPBestPractices(queryAnalysis);
      
      // Step 6: Calculate overall confidence and compile results
      const result = this.compileValidationResult(
        queryAnalysis,
        joinValidation,
        tableValidation,
        businessLogicValidation,
        sapValidation
      );
      
      return result;
    } catch (error) {
      return {
        isValid: false,
        confidence: 0.0,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        suggestions: ['Please check SQL syntax and try again'],
        joinValidation: {
          validJoins: [],
          invalidJoins: [],
          missingJoins: []
        },
        tableValidation: {
          validTables: [],
          invalidTables: [],
          unusedTables: []
        },
        businessLogicValidation: {
          isBusinessLogicValid: false,
          businessRuleViolations: ['Validation process failed']
        }
      };
    }
  }

  /**
   * Parse SQL to extract tables, joins, columns, etc.
   */
  private parseSQL(sql: string): QueryAnalysis {
    const normalizedSQL = sql.toUpperCase().replace(/\s+/g, ' ').trim();
    
    // Extract tables
    const tables = this.extractTables(normalizedSQL);
    
    // Extract joins
    const joins = this.extractJoins(normalizedSQL);
    
    // Extract columns
    const columns = this.extractColumns(normalizedSQL);
    
    // Extract WHERE conditions
    const whereConditions = this.extractWhereConditions(normalizedSQL);
    
    // Check for aggregation and subqueries
    const hasAggregation = /\b(COUNT|SUM|AVG|MAX|MIN|GROUP BY)\b/.test(normalizedSQL);
    const hasSubqueries = /\b(SELECT\b.*\bSELECT)\b/.test(normalizedSQL);
    
    return {
      tables,
      joins,
      columns,
      whereConditions,
      hasAggregation,
      hasSubqueries
    };
  }

  private extractTables(sql: string): string[] {
    const tables: string[] = [];
    
    // Extract FROM clause tables
    const fromMatch = sql.match(/FROM\s+"?(\w+)"?/);
    if (fromMatch) {
      tables.push(fromMatch[1].replace(/"/g, ''));
    }
    
    // Extract JOIN clause tables
    const joinMatches = sql.matchAll(/(?:INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+"?(\w+)"?/g);
    for (const match of joinMatches) {
      tables.push(match[1].replace(/"/g, ''));
    }
    
    return [...new Set(tables)]; // Remove duplicates
  }

  private extractJoins(sql: string): QueryAnalysis['joins'] {
    const joins: QueryAnalysis['joins'] = [];
    
    // Match JOIN patterns: JOIN "TABLE" ON "LEFT_TABLE"."LEFT_COL" = "RIGHT_TABLE"."RIGHT_COL"
    const joinPattern = /(INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+"?(\w+)"?\s+ON\s+"?(\w+)"?\."?(\w+)"?\s*=\s*"?(\w+)"?\."?(\w+)"?/g;
    
    let match;
    while ((match = joinPattern.exec(sql)) !== null) {
      joins.push({
        leftTable: match[3].replace(/"/g, ''),
        leftColumn: match[4].replace(/"/g, ''),
        rightTable: match[5].replace(/"/g, ''),
        rightColumn: match[6].replace(/"/g, ''),
        joinType: (match[1] || 'INNER').trim()
      });
    }
    
    return joins;
  }

  private extractColumns(sql: string): string[] {
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/);
    if (!selectMatch) return [];
    
    const columnsPart = selectMatch[1];
    const columns = columnsPart.split(',').map(col => 
      col.trim().replace(/"/g, '').replace(/\s+AS\s+\w+/i, '')
    );
    
    return columns;
  }

  private extractWhereConditions(sql: string): string[] {
    const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s*$)/);
    if (!whereMatch) return [];
    
    return whereMatch[1].split(/\s+AND\s+|\s+OR\s+/).map(condition => condition.trim());
  }

  /**
   * Validate joins against ground truth relationships
   */
  private validateJoins(queryAnalysis: QueryAnalysis, groundTruth: GroundTruthGraph) {
    const validJoins: string[] = [];
    const invalidJoins: string[] = [];
    const missingJoins: string[] = [];
    
    // Check each join in the query against ground truth
    for (const queryJoin of queryAnalysis.joins) {
      const joinKey = `${queryJoin.leftTable}.${queryJoin.leftColumn} = ${queryJoin.rightTable}.${queryJoin.rightColumn}`;
      
      // Look for this join in ground truth
      const groundTruthJoin = groundTruth.joins.find(gtJoin => 
        (gtJoin.left === `${queryJoin.leftTable}.${queryJoin.leftColumn}` && 
         gtJoin.right === `${queryJoin.rightTable}.${queryJoin.rightColumn}`) ||
        (gtJoin.left === `${queryJoin.rightTable}.${queryJoin.rightColumn}` && 
         gtJoin.right === `${queryJoin.leftTable}.${queryJoin.leftColumn}`)
      );
      
      if (groundTruthJoin) {
        validJoins.push(joinKey);
      } else {
        invalidJoins.push(joinKey);
      }
    }
    
    // Check for missing joins that should be present
    const queryTables = queryAnalysis.tables;
    if (queryTables.length > 1) {
      for (const gtJoin of groundTruth.joins) {
        const [leftTable] = gtJoin.left.split('.');
        const [rightTable] = gtJoin.right.split('.');
        
        if (queryTables.includes(leftTable) && queryTables.includes(rightTable)) {
          const joinExists = queryAnalysis.joins.some(qJoin => 
            (qJoin.leftTable === leftTable && qJoin.rightTable === rightTable) ||
            (qJoin.leftTable === rightTable && qJoin.rightTable === leftTable)
          );
          
          if (!joinExists) {
            missingJoins.push(`${gtJoin.left} = ${gtJoin.right}`);
          }
        }
      }
    }
    
    return { validJoins, invalidJoins, missingJoins };
  }

  /**
   * Validate table usage against ground truth
   */
  private validateTables(queryAnalysis: QueryAnalysis, groundTruth: GroundTruthGraph) {
    const validTables: string[] = [];
    const invalidTables: string[] = [];
    const unusedTables: string[] = [];
    
    // Check if all query tables exist in ground truth
    for (const table of queryAnalysis.tables) {
      if (groundTruth.tables[table]) {
        validTables.push(table);
      } else {
        invalidTables.push(table);
      }
    }
    
    // Find tables in ground truth that could be relevant but aren't used
    const allGroundTruthTables = Object.keys(groundTruth.tables);
    for (const table of allGroundTruthTables) {
      if (!queryAnalysis.tables.includes(table)) {
        // Check if this table has relationships with used tables
        const hasRelationship = groundTruth.joins.some(join => {
          const [leftTable] = join.left.split('.');
          const [rightTable] = join.right.split('.');
          return (queryAnalysis.tables.includes(leftTable) && table === rightTable) ||
                 (queryAnalysis.tables.includes(rightTable) && table === leftTable);
        });
        
        if (hasRelationship) {
          unusedTables.push(table);
        }
      }
    }
    
    return { validTables, invalidTables, unusedTables };
  }

  /**
   * Validate business logic and SAP-specific rules
   */
  private validateBusinessLogic(queryAnalysis: QueryAnalysis, businessContext?: string) {
    const businessRuleViolations: string[] = [];
    let isBusinessLogicValid = true;
    
    // SAP-specific business rule validations
    const tables = queryAnalysis.tables;
    
    // Rule 1: If VBAK and MARA are both used, VBAP should be included as bridge table
    if (tables.includes('VBAK') && tables.includes('MARA') && !tables.includes('VBAP')) {
      businessRuleViolations.push('VBAP table should be included as bridge between VBAK and MARA');
      isBusinessLogicValid = false;
    }
    
    // Rule 2: Sales orders should include customer information when possible
    if (tables.includes('VBAK') && !tables.includes('KNA1')) {
      businessRuleViolations.push('Consider including KNA1 for customer information with sales orders');
    }
    
    // Rule 3: Material queries should consider plant-specific data
    if (tables.includes('MARA') && queryAnalysis.columns.some(col => col.includes('WERKS'))) {
      if (!tables.includes('MARC')) {
        businessRuleViolations.push('Consider including MARC table for plant-specific material data');
      }
    }
    
    return { isBusinessLogicValid, businessRuleViolations };
  }

  /**
   * Validate SAP best practices
   */
  private validateSAPBestPractices(queryAnalysis: QueryAnalysis) {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Check for performance considerations
    if (queryAnalysis.tables.length > 5) {
      warnings.push('Query involves many tables, consider performance impact');
      suggestions.push('Consider breaking down into smaller queries or using views');
    }
    
    // Check for missing WHERE clauses on large tables
    const largeTables = ['VBAP', 'BSEG', 'KONV'];
    const usedLargeTables = queryAnalysis.tables.filter(table => largeTables.includes(table));
    
    if (usedLargeTables.length > 0 && queryAnalysis.whereConditions.length === 0) {
      warnings.push('Large tables used without WHERE conditions may impact performance');
      suggestions.push('Add appropriate WHERE conditions to limit result set');
    }
    
    // Check for proper column aliasing
    const hasAliases = queryAnalysis.columns.some(col => col.includes(' AS '));
    if (!hasAliases) {
      suggestions.push('Consider using meaningful column aliases for better readability');
    }
    
    return { warnings, suggestions };
  }

  /**
   * Compile final validation result
   */
  private compileValidationResult(
    queryAnalysis: QueryAnalysis,
    joinValidation: any,
    tableValidation: any,
    businessLogicValidation: any,
    sapValidation: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [...sapValidation.warnings];
    const suggestions: string[] = [...sapValidation.suggestions];
    
    // Add join-related errors
    if (joinValidation.invalidJoins.length > 0) {
      errors.push(`Invalid joins detected: ${joinValidation.invalidJoins.join(', ')}`);
    }
    
    // Add table-related errors
    if (tableValidation.invalidTables.length > 0) {
      errors.push(`Invalid tables detected: ${tableValidation.invalidTables.join(', ')}`);
    }
    
    // Add business logic violations
    if (!businessLogicValidation.isBusinessLogicValid) {
      warnings.push(...businessLogicValidation.businessRuleViolations);
    }
    
    // Add missing join warnings
    if (joinValidation.missingJoins.length > 0) {
      warnings.push(`Potentially missing joins: ${joinValidation.missingJoins.join(', ')}`);
    }
    
    // Calculate confidence score
    let confidence = 1.0;
    confidence -= errors.length * 0.3; // Major penalty for errors
    confidence -= warnings.length * 0.1; // Minor penalty for warnings
    confidence = Math.max(0.0, Math.min(1.0, confidence));
    
    const isValid = errors.length === 0;
    
    return {
      isValid,
      confidence,
      errors,
      warnings,
      suggestions,
      joinValidation,
      tableValidation,
      businessLogicValidation
    };
  }

  /**
   * Get the latest ground truth for validation
   */
  async getGroundTruthForValidation(): Promise<GroundTruthGraph | null> {
    try {
      const latestGroundTruth = await this.prisma.groundTruth.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      
      if (!latestGroundTruth) {
        return null;
      }
      
      return latestGroundTruth.graph as unknown as GroundTruthGraph;
    } catch (error) {
      console.error('Error fetching ground truth:', error);
      return null;
    }
  }
}