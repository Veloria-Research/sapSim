/**
 * SQL Formatter Utility
 * Formats SQL queries with proper indentation and structure
 */

export interface SQLFormatOptions {
  indentSize?: number;
  keywordCase?: 'upper' | 'lower';
  lineBreakAfterKeywords?: boolean;
}

const DEFAULT_OPTIONS: SQLFormatOptions = {
  indentSize: 2,
  keywordCase: 'upper',
  lineBreakAfterKeywords: true,
};

// SQL Keywords that should be formatted
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
  'ON', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'HAVING', 'UNION', 'UNION ALL',
  'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'AS', 'DISTINCT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IN', 'NOT IN', 'EXISTS', 'NOT EXISTS',
  'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN'
];

// Keywords that should start a new line
const LINE_BREAK_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'UNION', 'UNION ALL'
];

// Keywords that should increase indentation
const INDENT_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING'];

export function formatSQL(sql: string, options: SQLFormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!sql || typeof sql !== 'string') {
    return '';
  }

  // Clean up the SQL string
  let formattedSQL = sql.trim();
  
  // Remove extra whitespace
  formattedSQL = formattedSQL.replace(/\s+/g, ' ');
  
  // Split by common SQL keywords while preserving them
  const tokens = tokenizeSQL(formattedSQL);
  
  let result = '';
  let indentLevel = 0;
  let previousToken = '';
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) continue;
    
    const upperToken = token.toUpperCase();
    const isKeyword = SQL_KEYWORDS.includes(upperToken);
    const shouldBreakLine = LINE_BREAK_KEYWORDS.includes(upperToken);
    
    // Handle line breaks and indentation
    if (shouldBreakLine && result.length > 0) {
      result += '\n';
      
      // Adjust indentation for specific keywords
      if (upperToken === 'SELECT') {
        indentLevel = 0;
      } else if (['FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING'].includes(upperToken)) {
        indentLevel = 0;
      } else if (upperToken.includes('JOIN')) {
        indentLevel = 1;
      }
      
      result += ' '.repeat(indentLevel * opts.indentSize!);
    } else if (result.length > 0 && !result.endsWith(' ') && !result.endsWith('\n')) {
      result += ' ';
    }
    
    // Format the token
    if (isKeyword) {
      result += opts.keywordCase === 'upper' ? upperToken : token.toLowerCase();
    } else {
      result += token;
    }
    
    // Handle special cases for column lists
    if (upperToken === 'SELECT' && i + 1 < tokens.length) {
      const nextTokens = getSelectColumns(tokens, i + 1);
      if (nextTokens.length > 0) {
        result += '\n' + ' '.repeat((indentLevel + 1) * opts.indentSize!);
        result += nextTokens.join(',\n' + ' '.repeat((indentLevel + 1) * opts.indentSize!));
        i += nextTokens.length;
      }
    }
    
    previousToken = upperToken;
  }
  
  return result.trim();
}

function tokenizeSQL(sql: string): string[] {
  // Split by keywords while preserving them
  const keywordPattern = new RegExp(`\\b(${SQL_KEYWORDS.join('|')})\\b`, 'gi');
  const tokens: string[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = keywordPattern.exec(sql)) !== null) {
    // Add text before the keyword
    if (match.index > lastIndex) {
      const beforeKeyword = sql.substring(lastIndex, match.index).trim();
      if (beforeKeyword) {
        tokens.push(beforeKeyword);
      }
    }
    
    // Add the keyword
    tokens.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < sql.length) {
    const remaining = sql.substring(lastIndex).trim();
    if (remaining) {
      tokens.push(remaining);
    }
  }
  
  return tokens;
}

function getSelectColumns(tokens: string[], startIndex: number): string[] {
  const columns: string[] = [];
  let currentColumn = '';
  let parenLevel = 0;
  
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i].trim();
    const upperToken = token.toUpperCase();
    
    // Stop at FROM keyword
    if (upperToken === 'FROM' && parenLevel === 0) {
      if (currentColumn.trim()) {
        columns.push(currentColumn.trim());
      }
      break;
    }
    
    // Track parentheses
    parenLevel += (token.match(/\(/g) || []).length;
    parenLevel -= (token.match(/\)/g) || []).length;
    
    // Handle commas
    if (token.includes(',') && parenLevel === 0) {
      const parts = token.split(',');
      currentColumn += parts[0];
      if (currentColumn.trim()) {
        columns.push(currentColumn.trim());
      }
      
      // Handle multiple commas in one token
      for (let j = 1; j < parts.length - 1; j++) {
        if (parts[j].trim()) {
          columns.push(parts[j].trim());
        }
      }
      
      currentColumn = parts[parts.length - 1];
    } else {
      if (currentColumn && !currentColumn.endsWith(' ') && !token.startsWith(' ')) {
        currentColumn += ' ';
      }
      currentColumn += token;
    }
  }
  
  return columns;
}

/**
 * Simple SQL formatter for basic formatting needs
 */
export function formatSQLSimple(sql: string): string {
  if (!sql || typeof sql !== 'string') {
    return '';
  }

  let formatted = sql.trim();
  
  // Normalize whitespace
  formatted = formatted.replace(/\s+/g, ' ');
  
  // Add line breaks before major keywords
  formatted = formatted.replace(/\b(FROM|WHERE|ORDER BY|GROUP BY|HAVING|UNION)\b/gi, '\n$1');
  
  // Handle JOIN clauses - put them on new lines
  formatted = formatted.replace(/\b(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN)\b/gi, '\n       $1');
  
  // Handle ON clauses for JOINs
  formatted = formatted.replace(/\bON\b/gi, '\n            ON');
  
  // Handle SELECT columns - put each column on a new line
  formatted = formatted.replace(/SELECT\s+/i, 'SELECT\n       ');
  formatted = formatted.replace(/,\s*(?=\w|")/g, ',\n       ');
  
  // Handle AS aliases properly
  formatted = formatted.replace(/\s+AS\s+/gi, ' AS ');
  
  // Clean up multiple line breaks
  formatted = formatted.replace(/\n\s*\n/g, '\n');
  
  // Split into lines and apply proper indentation
  const lines = formatted.split('\n');
  const result = lines.map((line, index) => {
    const trimmed = line.trim();
    
    if (!trimmed) return '';
    
    // Main keywords at the start
    if (/^(SELECT|FROM|WHERE|ORDER BY|GROUP BY|HAVING|UNION)/i.test(trimmed)) {
      return trimmed;
    }
    // JOIN clauses
    else if (/^(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN)/i.test(trimmed)) {
      return '       ' + trimmed;
    }
    // ON clauses
    else if (/^ON\b/i.test(trimmed)) {
      return '            ' + trimmed;
    }
    // SELECT columns and other indented content
    else {
      return '       ' + trimmed;
    }
  }).filter(line => line.length > 0);
  
  return result.join('\n');
}