import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryHistory } from "./QueryHistory";
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
  Settings,
  History,
} from "lucide-react";

interface PipelineStatus {
  isRunning: boolean;
  currentStage: string;
  progress: number;
  stages: {
    name: string;
    status: "pending" | "running" | "completed" | "error";
    duration?: number;
    details?: string;
  }[];
}

interface PipelineResult {
  tablesAnalyzed: number;
  relationshipsInferred: number;
  schemasProcessed: number;
  status: string;
}

interface AnalyticsData {
  overview: {
    totalQueries: number;
    validQueries: number;
    averageConfidence: number;
    validationRate: number;
  };
  complexityDistribution: Array<{
    complexity: string;
    _count: { complexity: number };
  }>;
  recentQueries: Array<{
    prompt: string;
    confidence: number;
    complexity: string;
    validationStatus: string;
    createdAt: string;
  }>;
  popularTables: Array<{
    table: string;
    count: number;
  }>;
}

export function AIPipelineInterface() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    isRunning: false,
    currentStage: "",
    progress: 0,
    stages: [
      { name: "Data Extraction", status: "pending" },
      { name: "Schema Summarization", status: "pending" },
      { name: "Relationship Inference", status: "pending" },
      { name: "Column Analysis", status: "pending" },
      { name: "Ground Truth Building", status: "pending" },
    ],
  });

  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(
    null
  );
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/ai-pipeline/analytics"
      );
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.analytics);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
  };

  const runFullPipeline = async () => {
    setIsInitializing(true);
    setError(null);
    setPipelineResult(null);

    // Reset pipeline status
    setPipelineStatus({
      isRunning: true,
      currentStage: "Data Extraction",
      progress: 0,
      stages: [
        { name: "Data Extraction", status: "running" },
        { name: "Schema Summarization", status: "pending" },
        { name: "Relationship Inference", status: "pending" },
        { name: "Column Analysis", status: "pending" },
        { name: "Ground Truth Building", status: "pending" },
      ],
    });

    try {
      const response = await fetch("http://localhost:3001/api/ai/process-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Update pipeline status to completed
      setPipelineStatus((prev) => ({
        ...prev,
        isRunning: false,
        currentStage: "Completed",
        progress: 100,
        stages: prev.stages.map((stage) => ({ ...stage, status: "completed" })),
      }));

      setPipelineResult({
        tablesAnalyzed: data.pipeline.extraction.data.tables.length,
        relationshipsInferred: 0, // This would come from the actual response
        schemasProcessed: data.pipeline.summarization.summaries.length,
        status: "Pipeline completed successfully",
      });

      // Reload analytics
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run pipeline");
      setPipelineStatus((prev) => ({
        ...prev,
        isRunning: false,
        stages: prev.stages.map((stage) =>
          stage.status === "running" ? { ...stage, status: "error" } : stage
        ),
      }));
    } finally {
      setIsInitializing(false);
    }
  };

  const initializeAIPipeline = async () => {
    setIsInitializing(true);
    setError(null);
    setPipelineResult(null);

    try {
      const response = await fetch(
        "http://localhost:3001/api/ai-pipeline/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPipelineResult(data.result);
      await loadAnalytics();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize AI pipeline"
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "running":
        return <Spinner className="w-4 h-4 text-blue-600" />;
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">AI Pipeline</h1>
        <p className="text-gray-600">
          Manage and monitor the AI pipeline for schema analysis and query
          generation
        </p>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="pipeline">Pipeline Control</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="queries">Query History</TabsTrigger>
          <TabsTrigger value="status">System Status</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-6">
          {/* Pipeline Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex gap-2 items-center">
                <Brain className="w-5 h-5" />
                Pipeline Operations
              </CardTitle>
              <CardDescription>
                Initialize and manage the AI pipeline for comprehensive data
                analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Button
                  onClick={runFullPipeline}
                  disabled={isInitializing || pipelineStatus.isRunning}
                  className="flex flex-col gap-2 justify-center items-center h-20"
                >
                  {isInitializing ? (
                    <>
                      <Spinner className="w-6 h-6" />
                      <span>Running Full Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-6 h-6" />
                      <span>Run Full Pipeline</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={initializeAIPipeline}
                  disabled={isInitializing || pipelineStatus.isRunning}
                  variant="outline"
                  className="flex flex-col gap-2 justify-center items-center h-20"
                >
                  {isInitializing ? (
                    <>
                      <Spinner className="w-6 h-6" />
                      <span>Initializing...</span>
                    </>
                  ) : (
                    <>
                      <Settings className="w-6 h-6" />
                      <span>Initialize Pipeline</span>
                    </>
                  )}
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Status */}
          {(pipelineStatus.isRunning || pipelineResult) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex gap-2 items-center">
                  <GitBranch className="w-5 h-5" />
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
                    <Progress
                      value={pipelineStatus.progress}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {pipelineStatus.stages.map((stage, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-3 rounded-lg border"
                    >
                      <div className="flex gap-3 items-center">
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
                  <div className="p-4 mt-4 bg-green-50 rounded-lg border border-green-200">
                    <h4 className="mb-2 font-medium text-green-900">
                      Pipeline Results
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                      <div>
                        <span className="text-green-700">Tables Analyzed:</span>
                        <span className="ml-2 font-medium">
                          {pipelineResult.tablesAnalyzed}
                        </span>
                      </div>
                      <div>
                        <span className="text-green-700">
                          Schemas Processed:
                        </span>
                        <span className="ml-2 font-medium">
                          {pipelineResult.schemasProcessed}
                        </span>
                      </div>
                      <div>
                        <span className="text-green-700">Status:</span>
                        <span className="ml-2 font-medium">
                          {pipelineResult.status}
                        </span>
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-600">
                          Total Queries
                        </p>
                        <p className="text-2xl font-bold">
                          {analytics.overview?.totalQueries || 0}
                        </p>
                      </div>
                      <Database className="w-8 h-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-600">
                          Valid Queries
                        </p>
                        <p className="text-2xl font-bold">
                          {analytics.overview?.validQueries || 0}
                        </p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-600">
                          Avg Confidence
                        </p>
                        <p className="text-2xl font-bold">
                          {(analytics.overview?.averageConfidence || 0).toFixed(
                            1
                          )}
                          %
                        </p>
                      </div>
                      <BarChart3 className="w-8 h-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-600">
                          Validation Rate
                        </p>
                        <p className="text-2xl font-bold">
                          {(analytics.overview?.validationRate || 0).toFixed(1)}
                          %
                        </p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Queries */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Queries</CardTitle>
                  <CardDescription>
                    Latest queries generated by the AI pipeline
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-left">
                    {analytics.recentQueries &&
                    analytics.recentQueries.length > 0 ? (
                      analytics.recentQueries.map((query, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center p-3 rounded-lg border"
                        >
                          <div className="flex-1">
                            <p className="font-medium truncate">
                              {query.prompt}
                            </p>
                            <p className="text-sm text-gray-500">
                              {new Date(query.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2 items-center">
                            <Badge variant="outline">{query.complexity}</Badge>
                            <Badge
                              className={
                                query.validationStatus === "valid"
                                  ? "bg-green-100 text-green-800"
                                  : query.validationStatus === "warning"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {query.validationStatus}
                            </Badge>
                            <span className="text-sm font-medium">
                              {query.confidence.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-gray-500">
                        <p>No recent queries found</p>
                        <p className="text-sm">
                          Run the AI pipeline to generate some queries
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="queries" className="space-y-6">
          <QueryHistory />
        </TabsContent>

        <TabsContent value="status" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex gap-2 items-center">
                <RefreshCw className="w-5 h-5" />
                System Status
              </CardTitle>
              <CardDescription>
                Current status of AI pipeline components and services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg border">
                  <div className="flex gap-3 items-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Schema Summarizer</span>
                  </div>
                  <Badge className="text-green-800 bg-green-100">Active</Badge>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg border">
                  <div className="flex gap-3 items-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Relationship Inference</span>
                  </div>
                  <Badge className="text-green-800 bg-green-100">Active</Badge>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg border">
                  <div className="flex gap-3 items-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Query Generator</span>
                  </div>
                  <Badge className="text-green-800 bg-green-100">Active</Badge>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg border">
                  <div className="flex gap-3 items-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Validator Agent</span>
                  </div>
                  <Badge className="text-green-800 bg-green-100">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
