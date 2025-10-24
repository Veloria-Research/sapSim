import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Database, Brain, Search, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import './App.css'

// Types
interface TableStructure {
  name: string
  fields: string[]
  sampleData: Record<string, any>[]
}

interface SchemaSummary {
  table: string
  summary: string
  businessContext: string
  keyFields: string[]
  relationships: string[]
}

interface GroundTruthGraph {
  version: string
  tables: Record<string, any>
  joins: Array<{
    left: string
    right: string
    type: string
    confidence: number
  }>
  metadata: {
    generatedAt: string
    totalTables: number
    totalJoins: number
    confidence: number
  }
}

interface ProcessResult {
  extraction: {
    tables: TableStructure[]
    savedTo: string
  }
  schemas: {
    summaries: SchemaSummary[]
  }
  groundTruth: {
    graph: GroundTruthGraph
    validation: {
      isValid: boolean
      errors: string[]
      warnings: string[]
    }
    id: string
  }
}

function App() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const runCompleteProcess = async () => {
    setIsProcessing(true)
    setError(null)
    setProgress(0)

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 500)

      const response = await fetch('http://localhost:3001/api/ai/process-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setProcessResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatConfidence = (confidence: number) => {
    const percentage = Math.round(confidence * 100)
    const variant = percentage >= 80 ? 'default' : percentage >= 60 ? 'secondary' : 'destructive'
    return <Badge variant={variant}>{percentage}%</Badge>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            SAP AI Ground Truth System
          </h1>
          <p className="text-lg text-gray-600">
            Automated schema analysis and ground truth generation for SAP data
          </p>
        </div>

        {/* Control Panel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Pipeline Control
            </CardTitle>
            <CardDescription>
              Run the complete AI pipeline to extract, analyze, and generate ground truth
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <Button 
                onClick={runCompleteProcess} 
                disabled={isProcessing}
                size="lg"
                className="w-full sm:w-auto"
              >
                {isProcessing ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Run Complete AI Pipeline
                  </>
                )}
              </Button>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Processing...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {processResult && (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="extraction">Data Extraction</TabsTrigger>
              <TabsTrigger value="schemas">Schema Analysis</TabsTrigger>
              <TabsTrigger value="groundtruth">Ground Truth</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tables Processed</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{processResult.extraction.tables.length}</div>
                    <p className="text-xs text-muted-foreground">SAP core tables</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Joins Identified</CardTitle>
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{processResult.groundTruth.graph.joins.length}</div>
                    <p className="text-xs text-muted-foreground">Relationship mappings</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Overall Confidence</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatConfidence(processResult.groundTruth.graph.metadata.confidence)}
                    </div>
                    <p className="text-xs text-muted-foreground">System confidence</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Process Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Data extraction completed</span>
                    <Badge variant="outline">{processResult.extraction.tables.length} tables</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Schema analysis completed</span>
                    <Badge variant="outline">{processResult.schemas.summaries.length} summaries</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Ground truth generated</span>
                    <Badge variant="outline">ID: {processResult.groundTruth.id.slice(-8)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Validation passed</span>
                    <Badge variant={processResult.groundTruth.validation.isValid ? "default" : "destructive"}>
                      {processResult.groundTruth.validation.isValid ? "Valid" : "Invalid"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Data Extraction Tab */}
            <TabsContent value="extraction" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Extracted Tables
                  </CardTitle>
                  <CardDescription>
                    Structure and sample data from SAP core tables
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {processResult.extraction.tables.map((table) => (
                      <Card key={table.name} className="border-l-4 border-l-blue-500">
                        <CardHeader>
                          <CardTitle className="text-lg">{table.name}</CardTitle>
                          <CardDescription>
                            {table.fields.length} fields, {table.sampleData.length} sample records
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-medium mb-2">Fields:</h4>
                              <div className="flex flex-wrap gap-1">
                                {table.fields.map((field) => (
                                  <Badge key={field} variant="outline" className="text-xs">
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Separator />
                            <div>
                              <h4 className="font-medium mb-2">Sample Data:</h4>
                              <div className="text-xs text-gray-600 max-h-20 overflow-y-auto">
                                {table.sampleData.slice(0, 2).map((record, idx) => (
                                  <div key={idx} className="mb-1">
                                    {Object.entries(record).slice(0, 3).map(([key, value]) => (
                                      <span key={key} className="mr-2">
                                        {key}: {String(value)}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Schema Analysis Tab */}
            <TabsContent value="schemas" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Schema Summaries
                  </CardTitle>
                  <CardDescription>
                    AI-generated semantic analysis of table schemas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {processResult.schemas.summaries.map((schema) => (
                      <Card key={schema.table} className="border-l-4 border-l-green-500">
                        <CardHeader>
                          <CardTitle className="text-lg">{schema.table}</CardTitle>
                          <CardDescription>{schema.businessContext}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Summary:</h4>
                            <p className="text-sm text-gray-700">{schema.summary}</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-medium mb-2">Key Fields:</h4>
                              <div className="flex flex-wrap gap-1">
                                {schema.keyFields.map((field) => (
                                  <Badge key={field} variant="default" className="text-xs">
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-medium mb-2">Relationships:</h4>
                              <div className="space-y-1">
                                {schema.relationships.map((rel, idx) => (
                                  <div key={idx} className="text-xs text-gray-600 font-mono">
                                    {rel}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ground Truth Tab */}
            <TabsContent value="groundtruth" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Joins */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      Identified Joins
                    </CardTitle>
                    <CardDescription>
                      Automatically detected table relationships
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {processResult.groundTruth.graph.joins.map((join, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">
                              {join.left} → {join.right}
                            </span>
                            {formatConfidence(join.confidence)}
                          </div>
                          <div className="text-xs text-gray-600">
                            Type: <Badge variant="outline">{join.type.toUpperCase()}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Metadata */}
                <Card>
                  <CardHeader>
                    <CardTitle>Ground Truth Metadata</CardTitle>
                    <CardDescription>
                      Generation details and validation results
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Version:</span>
                        <div className="text-gray-600 font-mono">
                          {processResult.groundTruth.graph.version}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Generated:</span>
                        <div className="text-gray-600">
                          {new Date(processResult.groundTruth.graph.metadata.generatedAt).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Tables:</span>
                        <div className="text-gray-600">
                          {processResult.groundTruth.graph.metadata.totalTables}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Joins:</span>
                        <div className="text-gray-600">
                          {processResult.groundTruth.graph.metadata.totalJoins}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">Validation Status:</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">Validation Passed</span>
                      </div>
                      
                      {processResult.groundTruth.validation.warnings.length > 0 && (
                        <div className="mt-2">
                          <h5 className="text-sm font-medium text-yellow-600 mb-1">Warnings:</h5>
                          {processResult.groundTruth.validation.warnings.map((warning, idx) => (
                            <div key={idx} className="text-xs text-yellow-600">
                              • {warning}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Table Definitions */}
              <Card>
                <CardHeader>
                  <CardTitle>Table Definitions</CardTitle>
                  <CardDescription>
                    Processed table structures in the ground truth graph
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(processResult.groundTruth.graph.tables).map(([tableName, tableInfo]: [string, any]) => (
                      <div key={tableName} className="p-3 border rounded-lg">
                        <h4 className="font-medium mb-2">{tableName}</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium">Primary Key:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tableInfo.key.map((key: string) => (
                                <Badge key={key} variant="default" className="text-xs">
                                  {key}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Fields:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tableInfo.fields.map((field: string) => (
                                <Badge key={field} variant="outline" className="text-xs">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {tableInfo.delta_by && (
                            <div>
                              <span className="font-medium">Delta Field:</span>
                              <Badge variant="secondary" className="text-xs ml-1">
                                {tableInfo.delta_by}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

export default App
