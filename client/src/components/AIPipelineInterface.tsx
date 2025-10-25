import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Brain, 
  Database, 
  GitBranch, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Play,
  RefreshCw,
  BarChart3,
  FileText,
  Settings
} from 'lucide-react'

interface PipelineStatus {
  isRunning: boolean
  currentStage: string
  progress: number
  stages: {
    name: string
    status: 'pending' | 'running' | 'completed' | 'error'
    duration?: number
    details?: string
  }[]
}

interface PipelineResult {
  tablesAnalyzed: number
  relationshipsInferred: number
  schemasProcessed: number
  status: string
}

interface AnalyticsData {
  overview: {
    totalQueries: number
    validQueries: number
    averageConfidence: number
    validationRate: number
  }
  complexityDistribution: Array<{
    complexity: string
    _count: { complexity: number }
  }>
  recentQueries: Array<{
    prompt: string
    confidence: number
    complexity: string
    validationStatus: string
    createdAt: string
  }>
  popularTables: Array<{
    table: string
    count: number
  }>
}

export function AIPipelineInterface() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    isRunning: false,
    currentStage: '',
    progress: 0,
    stages: [
      { name: 'Data Extraction', status: 'pending' },
      { name: 'Schema Summarization', status: 'pending' },
      { name: 'Relationship Inference', status: 'pending' },
      { name: 'Column Analysis', status: 'pending' },
      { name: 'Ground Truth Building', status: 'pending' }
    ]
  })
  
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ai-pipeline/analytics')
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data.analytics)
      }
    } catch (err) {
      console.error('Failed to load analytics:', err)
    }
  }

  const runFullPipeline = async () => {
    setIsInitializing(true)
    setError(null)
    setPipelineResult(null)
    
    // Reset pipeline status
    setPipelineStatus({
      isRunning: true,
      currentStage: 'Data Extraction',
      progress: 0,
      stages: [
        { name: 'Data Extraction', status: 'running' },
        { name: 'Schema Summarization', status: 'pending' },
        { name: 'Relationship Inference', status: 'pending' },
        { name: 'Column Analysis', status: 'pending' },
        { name: 'Ground Truth Building', status: 'pending' }
      ]
    })

    try {
      const response = await fetch('http://localhost:3001/api/ai/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      // Update pipeline status to completed
      setPipelineStatus(prev => ({
        ...prev,
        isRunning: false,
        currentStage: 'Completed',
        progress: 100,
        stages: prev.stages.map(stage => ({ ...stage, status: 'completed' }))
      }))

      setPipelineResult({
        tablesAnalyzed: data.pipeline.extraction.data.tables.length,
        relationshipsInferred: 0, // This would come from the actual response
        schemasProcessed: data.pipeline.summarization.summaries.length,
        status: 'Pipeline completed successfully'
      })

      // Reload analytics
      await loadAnalytics()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run pipeline')
      setPipelineStatus(prev => ({
        ...prev,
        isRunning: false,
        stages: prev.stages.map(stage => 
          stage.status === 'running' ? { ...stage, status: 'error' } : stage
        )
      }))
    } finally {
      setIsInitializing(false)
    }
  }

  const initializeAIPipeline = async () => {
    setIsInitializing(true)
    setError(null)
    setPipelineResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/ai-pipeline/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setPipelineResult(data.result)
      await loadAnalytics()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize AI pipeline')
    } finally {
      setIsInitializing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'running':
        return <Spinner className="h-4 w-4 text-blue-600" />
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Pipeline</h1>
        <p className="text-gray-600">Manage and monitor the AI pipeline for schema analysis and query generation</p>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pipeline">Pipeline Control</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="status">System Status</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-6">
          {/* Pipeline Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Pipeline Operations
              </CardTitle>
              <CardDescription>
                Initialize and manage the AI pipeline for comprehensive data analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  onClick={runFullPipeline} 
                  disabled={isInitializing || pipelineStatus.isRunning}
                  className="h-20 flex flex-col items-center justify-center gap-2"
                >
                  {isInitializing ? (
                    <>
                      <Spinner className="h-6 w-6" />
                      <span>Running Full Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-6 w-6" />
                      <span>Run Full Pipeline</span>
                    </>
                  )}
                </Button>

                <Button 
                  onClick={initializeAIPipeline} 
                  disabled={isInitializing || pipelineStatus.isRunning}
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center gap-2"
                >
                  {isInitializing ? (
                    <>
                      <Spinner className="h-6 w-6" />
                      <span>Initializing...</span>
                    </>
                  ) : (
                    <>
                      <Settings className="h-6 w-6" />
                      <span>Initialize Pipeline</span>
                    </>
                  )}
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Status */}
          {(pipelineStatus.isRunning || pipelineResult) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Pipeline Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pipelineStatus.isRunning && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current Stage: {pipelineStatus.currentStage}</span>
                      <span>{pipelineStatus.progress}%</span>
                    </div>
                    <Progress value={pipelineStatus.progress} className="w-full" />
                  </div>
                )}

                <div className="space-y-2">
                  {pipelineStatus.stages.map((stage, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(stage.status)}
                        <span className="font-medium">{stage.name}</span>
                      </div>
                      <Badge className={getStatusColor(stage.status)}>
                        {stage.status}
                      </Badge>
                    </div>
                  ))}
                </div>

                {pipelineResult && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-900 mb-2">Pipeline Results</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-green-700">Tables Analyzed:</span>
                        <span className="ml-2 font-medium">{pipelineResult.tablesAnalyzed}</span>
                      </div>
                      <div>
                        <span className="text-green-700">Schemas Processed:</span>
                        <span className="ml-2 font-medium">{pipelineResult.schemasProcessed}</span>
                      </div>
                      <div>
                        <span className="text-green-700">Status:</span>
                        <span className="ml-2 font-medium">{pipelineResult.status}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {analytics && (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Queries</p>
                        <p className="text-2xl font-bold">{analytics.overview.totalQueries}</p>
                      </div>
                      <Database className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Valid Queries</p>
                        <p className="text-2xl font-bold">{analytics.overview.validQueries}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Avg Confidence</p>
                        <p className="text-2xl font-bold">{analytics.overview.averageConfidence.toFixed(1)}%</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Validation Rate</p>
                        <p className="text-2xl font-bold">{analytics.overview.validationRate.toFixed(1)}%</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Queries */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Queries</CardTitle>
                  <CardDescription>Latest queries generated by the AI pipeline</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.recentQueries.map((query, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium truncate">{query.prompt}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(query.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{query.complexity}</Badge>
                          <Badge className={
                            query.validationStatus === 'valid' ? 'bg-green-100 text-green-800' : 
                            query.validationStatus === 'warning' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }>
                            {query.validationStatus}
                          </Badge>
                          <span className="text-sm font-medium">{query.confidence.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="status" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                System Status
              </CardTitle>
              <CardDescription>
                Current status of AI pipeline components and services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Schema Summarizer</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Relationship Inference</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Query Generator</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Validator Agent</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}