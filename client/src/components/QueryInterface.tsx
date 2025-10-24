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
import { 
  MessageSquare, 
  Play, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Database,
  Code,
  History,
  Lightbulb
} from 'lucide-react'

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

export function QueryInterface() {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [templates, setTemplates] = useState<QueryTemplate[]>([])

  // Load query history and templates on component mount
  useEffect(() => {
    // TODO: Implement history and templates endpoints
    // loadHistory()
    // loadTemplates()
  }, [])

  const loadHistory = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sap-query/history')
      if (response.ok) {
        const data = await response.json()
        setHistory(data.data)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  const loadTemplates = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sap-query/templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.data)
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }

  const generateQuery = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setError(null)
    setQueryResult(null)
    setExecutionResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/sap-query/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt,
          includeExplanation: true
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setQueryResult(data.data)
      loadHistory() // Refresh history
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate query')
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
      setExecutionResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute query')
    } finally {
      setIsExecuting(false)
    }
  }

  const generateAndExecute = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setIsExecuting(true)
    setError(null)
    setQueryResult(null)
    setExecutionResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/sap-query/generate-and-execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt,
          limit: 10,
          includeExplanation: true
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setQueryResult(data.data.query)
      setExecutionResult(data.data.execution)
      loadHistory() // Refresh history
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate and execute query')
    } finally {
      setIsGenerating(false)
      setIsExecuting(false)
    }
  }

  const useTemplate = (template: QueryTemplate) => {
    setPrompt(template.prompt)
  }

  const useHistoryItem = (item: QueryHistory) => {
    setPrompt(item.prompt)
  }

  const getConfidenceBadge = (confidence: number) => {
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
        return null
    }
  }

  return (
    <div className="space-y-6">
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
          <Textarea
            placeholder="e.g., Show me all customers from Germany with their orders from last month"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px]"
          />
          
          <div className="flex gap-2">
            <Button 
              onClick={generateAndExecute} 
              disabled={isGenerating || isExecuting || !prompt.trim()}
              className="flex-1"
            >
              {(isGenerating || isExecuting) ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isGenerating ? 'Generating...' : 'Executing...'}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Generate & Execute
                </>
              )}
            </Button>
            
            <Button 
              onClick={generateQuery} 
              disabled={isGenerating || !prompt.trim()}
              variant="outline"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                <>
                  <Code className="mr-2 h-4 w-4" />
                  Generate Only
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

      {/* Generated Query Results */}
      {queryResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Generated SQL Query
              </span>
              <div className="flex items-center gap-2">
                {getValidationIcon(queryResult.validationStatus)}
                {getConfidenceBadge(queryResult.confidence)}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SQL Code */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {queryResult.sql}
              </pre>
            </div>

            {/* Query Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Query Analysis:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Complexity:</span>
                    <Badge variant="outline">{queryResult.complexity}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Tables Used:</span>
                    <div className="flex flex-wrap gap-1">
                      {queryResult.tablesUsed.map((table) => (
                        <Badge key={table} variant="secondary" className="text-xs">
                          {table}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {queryResult.joinTypes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Join Types:</span>
                      <div className="flex flex-wrap gap-1">
                        {queryResult.joinTypes.map((join) => (
                          <Badge key={join} variant="outline" className="text-xs">
                            {join}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Explanation:</h4>
                <p className="text-sm text-gray-700">{queryResult.explanation}</p>
              </div>
            </div>

            {/* Business Logic */}
            {queryResult.businessLogic && (
              <div>
                <h4 className="font-medium mb-2">Business Logic:</h4>
                <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg">{queryResult.businessLogic}</p>
              </div>
            )}

            {/* Warnings */}
            {queryResult.warnings && queryResult.warnings.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Warnings:</h4>
                <div className="space-y-1">
                  {queryResult.warnings.map((warning, idx) => (
                    <Alert key={idx} variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Validation Errors/Warnings */}
            {queryResult.validationErrors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Validation Issues:</h4>
                <div className="space-y-1">
                  {queryResult.validationErrors.map((error, idx) => (
                    <Alert key={idx} variant={queryResult.validationStatus === 'error' ? 'destructive' : 'default'}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Execution Results */}
      {executionResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Query Results
              </span>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                {executionResult.executionTime}ms
                <Separator orientation="vertical" className="h-4" />
                {executionResult.rowCount} rows
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {executionResult.results.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(executionResult.results[0]).map((column) => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executionResult.results.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx}>
                        {Object.values(row).map((value, cellIdx) => (
                          <TableCell key={cellIdx} className="font-mono text-sm">
                            {String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {executionResult.results.length > 10 && (
                  <div className="text-center text-sm text-gray-500 mt-2">
                    Showing first 10 of {executionResult.rowCount} rows
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                No results returned
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History and Templates */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Query History
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Lightbulb className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Queries</CardTitle>
              <CardDescription>
                Your previously generated queries
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.slice(0, 5).map((item) => (
                    <div key={item.id} className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                         onClick={() => useHistoryItem(item)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{item.prompt}</span>
                        <div className="flex items-center gap-2">
                          {getValidationIcon(item.validationStatus)}
                          {getConfidenceBadge(item.confidence)}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No query history yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Query Templates</CardTitle>
              <CardDescription>
                Pre-built query examples to get you started
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((template) => (
                    <div key={template.id} className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                         onClick={() => useTemplate(template)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                      <div className="text-xs text-gray-500 font-mono">
                        "{template.prompt}"
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No templates available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}