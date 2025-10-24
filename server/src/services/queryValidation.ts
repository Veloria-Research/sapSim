import { PrismaClient } from "@prisma/client";

export interface ValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  performanceScore: number; // 0-100
  securityScore: number; // 0-100
}

export interface ValidationError {
  type: 'syntax' | 'schema' | 'security' | 'performance' | 'business_rule';
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'data_quality';
  message: string;
  suggestion: string;
}

export interface QueryContext {
  tables: string[];
  columns: Array<{
    table: string;
    column: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    foreignKey: boolean;
  }>;
  relationships: Array<{
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    joinType: string;
  }>;
}

export class QueryValidation {
  private readonly maxQueryComplexity = 10;
  private readonly maxJoins = 5;
  private readonly maxResultLimit = 10000;

  constructor(private prisma: PrismaClient) {}

  async validateQuery(sql: string, context?: QueryContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    try {
      // Get context if not provided
      if (!context) {
        context = await this.buildQueryContext(sql);
      }

      // 1. Syntax validation
      const syntaxErrors = this.validateSyntax(sql);
      errors.push(...syntaxErrors);

      // 2. Schema validation
      const schemaErrors = await this.validateSchema(sql, context);
      errors.push(...schemaErrors);

      // 3. Security validation
      const securityErrors = this.validateSecurity(sql);
      errors.push(...securityErrors);

      // 4. Performance validation
      const performanceIssues = this.validatePerformance(sql, context);
      errors.push(...performanceIssues.errors);
      warnings.push(...performanceIssues.warnings);

      // 5. Business rule validation
      const businessRuleErrors = await this.validateBusinessRules(sql, context);
      errors.push(...businessRuleErrors);

      // 6. Best practices validation
      const bestPracticeWarnings = this.validateBestPractices(sql, context);
      warnings.push(...bestPracticeWarnings);

      // 7. Generate suggestions
      suggestions.push(...this.generateSuggestions(sql, context, errors, warnings));

      // Calculate scores
      const performanceScore = this.calculatePerformanceScore(sql, context, errors, warnings);
      const securityScore = this.calculateSecurityScore(sql, errors);

      return {
        isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0,
        hasWarnings: warnings.length > 0,
        errors,
        warnings,
        suggestions,
        performanceScore,
        securityScore
      };

    } catch (error) {
      console.error('Error validating query:', error);
      return {
        isValid: false,
        hasWarnings: false,
        errors: [{
          type: 'syntax',
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'critical'
        }],
        warnings: [],
        suggestions: [],
        performanceScore: 0,
        securityScore: 0
      };
    }
  }

  private validateSyntax(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const upperSQL = sql.toUpperCase().trim();

    // Basic SQL structure validation
    if (!upperSQL.startsWith('SELECT')) {
      errors.push({
        type: 'syntax',
        message: 'Query must start with SELECT statement',
        severity: 'critical',
        suggestion: 'Ensure your query begins with SELECT'
      });
    }

    // Check for balanced parentheses
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push({
        type: 'syntax',
        message: 'Unbalanced parentheses in query',
        severity: 'high',
        suggestion: 'Check that all opening parentheses have corresponding closing parentheses'
      });
    }

    // Check for basic SQL keywords structure
    if (upperSQL.includes('SELECT') && !upperSQL.includes('FROM')) {
      errors.push({
        type: 'syntax',
        message: 'SELECT statement missing FROM clause',
        severity: 'critical',
        suggestion: 'Add a FROM clause to specify the source table(s)'
      });
    }

    // Check for common syntax errors
    const commonErrors = [
      { pattern: /,\s*FROM/i, message: 'Trailing comma before FROM clause' },
      { pattern: /,\s*WHERE/i, message: 'Trailing comma before WHERE clause' },
      { pattern: /,\s*GROUP\s+BY/i, message: 'Trailing comma before GROUP BY clause' },
      { pattern: /,\s*ORDER\s+BY/i, message: 'Trailing comma before ORDER BY clause' }
    ];

    for (const error of commonErrors) {
      if (error.pattern.test(sql)) {
        errors.push({
          type: 'syntax',
          message: error.message,
          severity: 'high',
          suggestion: 'Remove the trailing comma'
        });
      }
    }

    return errors;
  }

  private async validateSchema(sql: string, context: QueryContext): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // Extract referenced tables and columns from SQL
      const referencedTables = this.extractTablesFromSQL(sql);
      const referencedColumns = this.extractColumnsFromSQL(sql);

      // Check if all referenced tables exist
      for (const table of referencedTables) {
        if (!context.tables.includes(table)) {
          errors.push({
            type: 'schema',
            message: `Table '${table}' does not exist`,
            severity: 'critical',
            location: `Table: ${table}`,
            suggestion: `Available tables: ${context.tables.join(', ')}`
          });
        }
      }

      // Check if all referenced columns exist
      for (const { table, column } of referencedColumns) {
        const tableColumns = context.columns.filter(c => c.table === table);
        if (tableColumns.length > 0 && !tableColumns.some(c => c.column === column)) {
          errors.push({
            type: 'schema',
            message: `Column '${column}' does not exist in table '${table}'`,
            severity: 'critical',
            location: `${table}.${column}`,
            suggestion: `Available columns in ${table}: ${tableColumns.map(c => c.column).join(', ')}`
          });
        }
      }

      // Validate JOIN conditions
      const joinErrors = this.validateJoinConditions(sql, context);
      errors.push(...joinErrors);

    } catch (error) {
      console.error('Error in schema validation:', error);
      errors.push({
        type: 'schema',
        message: 'Failed to validate schema references',
        severity: 'medium'
      });
    }

    return errors;
  }

  private validateSecurity(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const upperSQL = sql.toUpperCase();

    // Check for SQL injection patterns
    const injectionPatterns = [
      { pattern: /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)/i, message: 'Potential SQL injection: Multiple statements detected' },
      { pattern: /UNION\s+SELECT/i, message: 'Potential SQL injection: UNION SELECT detected' },
      { pattern: /--/g, message: 'SQL comments detected - potential injection vector' },
      { pattern: /\/\*/g, message: 'SQL block comments detected - potential injection vector' }
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.pattern.test(sql)) {
        errors.push({
          type: 'security',
          message: pattern.message,
          severity: 'critical',
          suggestion: 'Use parameterized queries and validate input'
        });
      }
    }

    // Check for dangerous operations
    const dangerousOperations = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE'];
    for (const op of dangerousOperations) {
      if (upperSQL.includes(op)) {
        errors.push({
          type: 'security',
          message: `Dangerous operation '${op}' detected`,
          severity: 'critical',
          suggestion: 'Only SELECT operations are allowed'
        });
      }
    }

    return errors;
  }

  private validatePerformance(sql: string, context: QueryContext): { errors: ValidationError[], warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const upperSQL = sql.toUpperCase();

    // Check for missing LIMIT clause
    if (!upperSQL.includes('LIMIT') && !upperSQL.includes('TOP')) {
      warnings.push({
        type: 'performance',
        message: 'Query without LIMIT clause may return large result sets',
        suggestion: 'Add LIMIT clause to control result set size'
      });
    }

    // Check for SELECT *
    if (sql.includes('SELECT *')) {
      warnings.push({
        type: 'performance',
        message: 'SELECT * may retrieve unnecessary columns',
        suggestion: 'Specify only the columns you need'
      });
    }

    // Check for complex joins
    const joinCount = (upperSQL.match(/JOIN/g) || []).length;
    if (joinCount > this.maxJoins) {
      errors.push({
        type: 'performance',
        message: `Too many joins (${joinCount}). Maximum allowed: ${this.maxJoins}`,
        severity: 'high',
        suggestion: 'Consider breaking the query into smaller parts or using views'
      });
    }

    // Check for missing WHERE clause with joins
    if (joinCount > 0 && !upperSQL.includes('WHERE')) {
      warnings.push({
        type: 'performance',
        message: 'Joins without WHERE clause may produce cartesian products',
        suggestion: 'Add appropriate WHERE conditions to filter results'
      });
    }

    // Check for functions in WHERE clause
    if (/WHERE.*\w+\s*\(/i.test(sql)) {
      warnings.push({
        type: 'performance',
        message: 'Functions in WHERE clause may prevent index usage',
        suggestion: 'Consider restructuring conditions to avoid functions on columns'
      });
    }

    return { errors, warnings };
  }

  private async validateBusinessRules(sql: string, context: QueryContext): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // SAP-specific business rules
      const upperSQL = sql.toUpperCase();

      // Check for client (MANDT) filtering in SAP tables
      const sapTables = context.tables.filter(t => ['KNA1', 'MARA', 'VBAK', 'VBAP'].includes(t));
      if (sapTables.length > 0 && !upperSQL.includes('MANDT')) {
        warnings.push({
          type: 'best_practice',
          message: 'SAP tables should include client (MANDT) filtering',
          suggestion: 'Add WHERE MANDT = \'800\' or appropriate client code'
        });
      }

      // Check for proper date filtering
      if (upperSQL.includes('DATE') && !upperSQL.includes('WHERE')) {
        warnings.push({
          type: 'best_practice',
          message: 'Date columns should typically include range filtering',
          suggestion: 'Add date range conditions to improve performance'
        });
      }

      // Validate relationship usage
      const joinErrors = await this.validateRelationshipUsage(sql, context);
      errors.push(...joinErrors);

    } catch (error) {
      console.error('Error validating business rules:', error);
    }

    return errors;
  }

  private validateBestPractices(sql: string, context: QueryContext): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const upperSQL = sql.toUpperCase();

    // Check for table aliases
    const joinCount = (upperSQL.match(/JOIN/g) || []).length;
    if (joinCount > 1 && !this.hasTableAliases(sql)) {
      warnings.push({
        type: 'best_practice',
        message: 'Consider using table aliases for better readability',
        suggestion: 'Use aliases like "SELECT c.name FROM customers c JOIN orders o ON c.id = o.customer_id"'
      });
    }

    // Check for proper column qualification
    if (joinCount > 0 && this.hasUnqualifiedColumns(sql)) {
      warnings.push({
        type: 'best_practice',
        message: 'Some columns may not be properly qualified with table names',
        suggestion: 'Prefix columns with table names or aliases to avoid ambiguity'
      });
    }

    // Check for ORDER BY without LIMIT
    if (upperSQL.includes('ORDER BY') && !upperSQL.includes('LIMIT')) {
      warnings.push({
        type: 'best_practice',
        message: 'ORDER BY without LIMIT may sort unnecessary rows',
        suggestion: 'Add LIMIT clause when using ORDER BY'
      });
    }

    return warnings;
  }

  private generateSuggestions(sql: string, context: QueryContext, errors: ValidationError[], warnings: ValidationWarning[]): string[] {
    const suggestions: string[] = [];

    // Performance suggestions
    if (!sql.toUpperCase().includes('LIMIT')) {
      suggestions.push('Add LIMIT clause to control result set size');
    }

    if (sql.includes('SELECT *')) {
      suggestions.push('Specify only the columns you need instead of SELECT *');
    }

    // Index suggestions
    const whereColumns = this.extractWhereColumns(sql);
    if (whereColumns.length > 0) {
      suggestions.push(`Consider creating indexes on frequently filtered columns: ${whereColumns.join(', ')}`);
    }

    // Join optimization
    const joinCount = (sql.toUpperCase().match(/JOIN/g) || []).length;
    if (joinCount > 2) {
      suggestions.push('Consider using views or materialized views for complex joins');
    }

    return suggestions;
  }

  private calculatePerformanceScore(sql: string, context: QueryContext, errors: ValidationError[], warnings: ValidationWarning[]): number {
    let score = 100;

    // Deduct points for performance issues
    const performanceErrors = errors.filter(e => e.type === 'performance');
    const performanceWarnings = warnings.filter(w => w.type === 'performance');

    score -= performanceErrors.length * 20;
    score -= performanceWarnings.length * 10;

    // Deduct for missing LIMIT
    if (!sql.toUpperCase().includes('LIMIT')) {
      score -= 15;
    }

    // Deduct for SELECT *
    if (sql.includes('SELECT *')) {
      score -= 10;
    }

    // Deduct for excessive joins
    const joinCount = (sql.toUpperCase().match(/JOIN/g) || []).length;
    if (joinCount > 3) {
      score -= (joinCount - 3) * 5;
    }

    return Math.max(0, score);
  }

  private calculateSecurityScore(sql: string, errors: ValidationError[]): number {
    let score = 100;

    const securityErrors = errors.filter(e => e.type === 'security');
    score -= securityErrors.length * 25;

    // Additional security checks
    if (sql.includes('--') || sql.includes('/*')) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  // Helper methods
  private async buildQueryContext(sql: string): Promise<QueryContext> {
    const tables = this.extractTablesFromSQL(sql);
    const columns: QueryContext['columns'] = [];
    const relationships: QueryContext['relationships'] = [];

    try {
      // Get column metadata for referenced tables
      for (const tableName of tables) {
        const tableColumns = await this.prisma.columnMetadata.findMany({
          where: { tableName },
          select: {
            columnName: true,
            dataType: true,
            isNullable: true,
            isPrimaryKey: true,
            isForeignKey: true
          }
        });

        columns.push(...tableColumns.map(col => ({
          table: tableName,
          column: col.columnName,
          type: col.dataType,
          nullable: col.isNullable,
          primaryKey: col.isPrimaryKey,
          foreignKey: col.isForeignKey
        })));
      }

      // Get relationships between tables
      const tableRelationships = await this.prisma.tableRelationship.findMany({
        where: {
          AND: [
            { leftTable: { in: tables } },
            { rightTable: { in: tables } }
          ]
        }
      });

      relationships.push(...tableRelationships.map(rel => ({
        leftTable: rel.leftTable,
        leftColumn: rel.leftColumn,
        rightTable: rel.rightTable,
        rightColumn: rel.rightColumn,
        joinType: rel.joinType
      })));

    } catch (error) {
      console.error('Error building query context:', error);
    }

    return { tables, columns, relationships };
  }

  private extractTablesFromSQL(sql: string): string[] {
    const tables: string[] = [];
    const upperSQL = sql.toUpperCase();

    // Extract FROM clause tables
    const fromMatches = upperSQL.match(/FROM\s+(\w+)/g);
    if (fromMatches) {
      fromMatches.forEach(match => {
        const table = match.replace(/FROM\s+/, '');
        tables.push(table);
      });
    }

    // Extract JOIN clause tables
    const joinMatches = upperSQL.match(/JOIN\s+(\w+)/g);
    if (joinMatches) {
      joinMatches.forEach(match => {
        const table = match.replace(/JOIN\s+/, '');
        tables.push(table);
      });
    }

    return [...new Set(tables)];
  }

  private extractColumnsFromSQL(sql: string): Array<{ table: string; column: string }> {
    const columns: Array<{ table: string; column: string }> = [];
    
    // Simple regex to extract qualified column references (table.column)
    const qualifiedColumns = sql.match(/\b(\w+)\.(\w+)\b/g);
    if (qualifiedColumns) {
      qualifiedColumns.forEach(match => {
        const [table, column] = match.split('.');
        columns.push({ table, column });
      });
    }

    return columns;
  }

  private extractWhereColumns(sql: string): string[] {
    const columns: string[] = [];
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const columnMatches = whereClause.match(/\b(\w+)\s*[=<>!]/g);
      if (columnMatches) {
        columnMatches.forEach(match => {
          const column = match.replace(/\s*[=<>!].*/, '');
          columns.push(column);
        });
      }
    }

    return [...new Set(columns)];
  }

  private validateJoinConditions(sql: string, context: QueryContext): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // This is a simplified validation - in practice, you'd want more sophisticated parsing
    const joinMatches = sql.match(/JOIN\s+\w+\s+ON\s+([^WHERE|GROUP|ORDER|LIMIT]+)/gi);
    
    if (joinMatches) {
      for (const joinMatch of joinMatches) {
        const onClause = joinMatch.match(/ON\s+(.+)/i);
        if (onClause) {
          const condition = onClause[1].trim();
          if (!condition.includes('=')) {
            errors.push({
              type: 'schema',
              message: 'JOIN condition should include equality comparison',
              severity: 'medium',
              location: `JOIN condition: ${condition}`,
              suggestion: 'Use proper JOIN conditions like table1.id = table2.foreign_id'
            });
          }
        }
      }
    }

    return errors;
  }

  private async validateRelationshipUsage(sql: string, context: QueryContext): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    
    // Check if joins are using established relationships
    const joinedTables = this.extractTablesFromSQL(sql);
    
    for (let i = 0; i < joinedTables.length - 1; i++) {
      for (let j = i + 1; j < joinedTables.length; j++) {
        const table1 = joinedTables[i];
        const table2 = joinedTables[j];
        
        const hasRelationship = context.relationships.some(rel => 
          (rel.leftTable === table1 && rel.rightTable === table2) ||
          (rel.leftTable === table2 && rel.rightTable === table1)
        );
        
        if (!hasRelationship) {
          errors.push({
            type: 'business_rule',
            message: `No established relationship found between ${table1} and ${table2}`,
            severity: 'medium',
            suggestion: 'Verify that the join condition is correct and necessary'
          });
        }
      }
    }

    return errors;
  }

  private hasTableAliases(sql: string): boolean {
    // Simple check for table aliases
    return /FROM\s+\w+\s+\w+/i.test(sql) || /JOIN\s+\w+\s+\w+/i.test(sql);
  }

  private hasUnqualifiedColumns(sql: string): boolean {
    // Check if there are column references without table qualification
    const selectClause = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectClause) {
      const columns = selectClause[1];
      return /\b\w+\b(?!\.)/.test(columns) && !columns.includes('*');
    }
    return false;
  }
}