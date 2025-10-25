import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  MessageSquare, 
  Play, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Database,
  Code,
  History,
  Lightbulb,
  Brain,
  Send,
  Copy,
  Download
} from 'lucide-react'
import { type QueryParameters } from './AppSidebar'

// Types
interface QueryResult {
  sql: string
  confidence: number
  explanation: string
  businessLogic: string
  tablesUsed: string[]
  joinTypes: string[]
  complexity: 'simple' | 'medium' | 'complex'
  validationStatus: 'valid' | 'warning' | 'error'
  validationErrors: string[]
  warnings?: string[]
}

interface ExecutionResult {
  results: any[]
  executionTime: number
  rowCount: number
}

interface QueryHistory {
  id: string
  prompt: string
  sql: string
  confidence: number
  complexity: string
  validationStatus: string
  createdAt: string
}

interface QueryTemplate {
  id: string
  name: string
  description: string
  prompt: string
  category: string
}

interface EnhancedQueryInterfaceProps {
  parameters?: QueryParameters
}

export function EnhancedQueryInterface({ parameters }: EnhancedQueryInterfaceProps) {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [templates, setTemplates] = useState<QueryTemplate[]>([])

  // Sample templates
  useEffect(() => {
    setTemplates([
      {
        id: '1',
        name: 'Sales Orders by Customer',
        description: 'Get sales orders for a specific customer',
        prompt: 'Show me all sales orders for customer 500000 with material details',
        category: 'Sales'
      },
      {
        id: '2',
        name: 'Material Inventory',
        description: 'Check material inventory levels',
        prompt: 'Show me current inventory levels for all materials',
        category: 'Inventory'
      },
      {
        id: '3',
        name: 'Customer Analysis',
        description: 'Analyze customer purchase patterns',
        prompt: 'Show me top 10 customers by total purchase amount',
        category: 'Analytics'
      }
    ])
  }, [])

  const loadHistory = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sap-query/history')
      if (response.ok) {
        const data = await response.json()
        setHistory(data.data || [])
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  const generateQueryWithAI = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setError(null)
    setQueryResult(null)
    setExecutionResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/ai-pipeline/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt,
          context: {
            businessDomain: parameters?.businessDomain || 'sales',
            preferredComplexity: parameters?.preferredComplexity || 'medium',
            includeExplanation: parameters?.includeExplanation ?? true,
            maxTables: parameters?.maxTables || 5,
            outputFormat: parameters?.outputFormat || 'both'
          },
          metadata: {
            useGroundTruth: parameters?.useGroundTruth ?? true,
            useSchemaSummary: parameters?.useSchemaSummary ?? true,
            useTableRelationships: parameters?.useTableRelationships ?? true,
            useColumnMetadata: parameters?.useColumnMetadata ?? true
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setQueryResult(data.result.query)
      loadHistory() // Refresh history
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate query with AI pipeline')
    } finally {
      setIsGenerating(false)
    }
  }

  const executeQuery = async () => {
    if (!queryResult?.sql) return

    setIsExecuting(true)
    setError(null)

    try {
      const response = await fetch('http://localhost:3001/api/sap-query/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: queryResult.sql }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setExecutionResult(data.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute query')
    } finally {
      setIsExecuting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatConfidence = (confidence: number) => {
    const percentage = Math.round(confidence * 100)
    const variant = percentage >= 80 ? 'default' : percentage >= 60 ? 'secondary' : 'destructive'
    return <Badge variant={variant}>{percentage}%</Badge>
  }

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Query Interface</h1>
        <p className="text-gray-600">Generate SQL queries using natural language with AI assistance</p>
      </div>

      {/* Quick Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Quick Templates
          </CardTitle>
          <CardDescription>
            Start with these common query patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setPrompt(template.prompt)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium">{template.name}</h4>
                    <Badge variant="outline" className="text-xs">{template.category}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                  <p className="text-xs text-gray-500 italic">"{template.prompt}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Query Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Natural Language Query
          </CardTitle>
          <CardDescription>
            Describe what data you want to retrieve in plain English
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query-prompt">Your Query</Label>
            <Textarea
              id="query-prompt"
              placeholder="e.g., Show me all sales orders from the last month with customer details and total amounts"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={generateQueryWithAI} 
              disabled={isGenerating || !prompt.trim()}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Generate SQL
                </>
              )}
            </Button>
            
            {queryResult && (
              <Button 
                onClick={executeQuery} 
                disabled={isExecuting}
                variant="outline"
              >
                {isExecuting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Execute
                  </>
                )}
              </Button>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Query Results */}
      {queryResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Generated Query
            </CardTitle>
            <CardDescription>
              AI-generated SQL query with analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sql" className="space-y-4">
              <TabsList>
                <TabsTrigger value="sql">SQL Query</TabsTrigger>
                <TabsTrigger value="explanation">Explanation</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
              </TabsList>

              <TabsContent value="sql" className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getValidationIcon(queryResult.validationStatus)}
                    <span className="text-sm font-medium">
                      Status: {queryResult.validationStatus}
                    </span>
                    {formatConfidence(queryResult.confidence)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(queryResult.sql)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                
                <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
                  <code>{queryResult.sql}</code>
                </pre>

                {queryResult.validationErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-1">
                        {queryResult.validationErrors.map((error, index) => (
                          <div key={index}>• {error}</div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="explanation" className="space-y-4">
                <div className="prose max-w-none">
                  <h4 className="text-lg font-medium mb-2">Query Explanation</h4>
                  <p className="text-gray-700 mb-4">{queryResult.explanation}</p>
                  
                  <h4 className="text-lg font-medium mb-2">Business Logic</h4>
                  <p className="text-gray-700">{queryResult.businessLogic}</p>
                </div>
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Tables Used</h4>
                    <div className="space-y-1">
                      {queryResult.tablesUsed.map((table, index) => (
                        <Badge key={index} variant="outline">{table}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Join Types</h4>
                    <div className="space-y-1">
                      {queryResult.joinTypes.map((join, index) => (
                        <Badge key={index} variant="secondary">{join}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Complexity</h4>
                    <Badge variant={queryResult.complexity === 'simple' ? 'default' : queryResult.complexity === 'medium' ? 'secondary' : 'destructive'}>
                      {queryResult.complexity}
                    </Badge>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Confidence Score</h4>
                    {formatConfidence(queryResult.confidence)}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Execution Results */}
      {executionResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Query Results
            </CardTitle>
            <CardDescription>
              {executionResult.rowCount} rows returned in {executionResult.executionTime}ms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {executionResult.results.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(executionResult.results[0]).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executionResult.results.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        {Object.values(row).map((value, cellIndex) => (
                          <TableCell key={cellIndex}>
                            {value !== null ? String(value) : 'NULL'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {executionResult.results.length > 10 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Showing first 10 of {executionResult.rowCount} rows
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No results returned</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}