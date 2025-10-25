import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Code,
  FileText,
  Play,
  Clock,
  Database,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Copy,
  RefreshCw,
} from "lucide-react";

interface QueryHistory {
  id: string;
  prompt: string;
  sql: string;
  explanation?: string;
  businessLogic?: string;
  confidence: number;
  complexity: string;
  tablesUsed: string[];
  joinTypes: string[];
  validationStatus: string;
  validationErrors?: string[];
  executionTime?: number;
  resultCount?: number;
  templateUsed?: string;
  createdAt: string;
}

interface ExecutionResult {
  results: any[];
  executionTime: number;
  rowCount: number;
}

interface QueryDetailModalProps {
  query: QueryHistory | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QueryDetailModal({
  query,
  isOpen,
  onClose,
}: QueryDetailModalProps) {
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Execute the query
  const executeQuery = async () => {
    if (!query) return;

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);

    try {
      const response = await fetch(
        "http://localhost:3001/api/sap-query/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sql: query.sql,
            limit: 50, // Limit results for performance
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setExecutionResult(data.data);
      } else {
        throw new Error(data.error || "Failed to execute query");
      }
    } catch (err) {
      console.error("Query execution error:", err);
      setExecutionError(
        err instanceof Error ? err.message : "Failed to execute query"
      );
    } finally {
      setIsExecuting(false);
    }
  };

  // Copy SQL to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "valid":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case "invalid":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Database className="w-4 h-4 text-gray-600" />;
    }
  };

  // Get badge variant for validation status
  const getValidationBadgeVariant = (status: string) => {
    switch (status) {
      case "valid":
        return "default";
      case "warning":
        return "secondary";
      case "invalid":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (!query) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <Database className="w-5 h-5" />
            Query Details
          </DialogTitle>
          <DialogDescription>
            Generated on {formatDate(query.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="space-y-4 w-[90vh]">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sql">SQL Query</TabsTrigger>
            <TabsTrigger value="explanation">Explanation</TabsTrigger>
            <TabsTrigger value="execution">Execute</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Query Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Prompt
                  </label>
                  <p className="p-3 mt-1 bg-gray-50 rounded-md">
                    {query.prompt}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Confidence
                    </label>
                    <p className="text-lg font-semibold">
                      {(query.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Complexity
                    </label>
                    <br />
                    <Badge className="mt-1">{query.complexity}</Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <div className="flex gap-2 items-center mt-1">
                      {getStatusIcon(query.validationStatus)}
                      <Badge
                        variant={getValidationBadgeVariant(
                          query.validationStatus
                        )}
                      >
                        {query.validationStatus}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Tables Used
                    </label>
                    <p className="text-lg font-semibold">
                      {query.tablesUsed?.length || 0}
                    </p>
                  </div>
                </div>

                {query.tablesUsed && query.tablesUsed.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Tables
                    </label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {query.tablesUsed.map((table, index) => (
                        <Badge key={index} variant="outline">
                          {table}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {query.joinTypes && query.joinTypes.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Join Types
                    </label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {query.joinTypes.map((joinType, index) => (
                        <Badge key={index} variant="secondary">
                          {joinType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {query.validationErrors &&
                  query.validationErrors.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-red-700">
                        Validation Errors
                      </label>
                      <div className="mt-1 space-y-1">
                        {query.validationErrors.map((error, index) => (
                          <p
                            key={index}
                            className="p-2 text-sm text-red-600 bg-red-50 rounded"
                          >
                            {error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SQL Query Tab */}
          <TabsContent value="sql" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex gap-2 items-center">
                    <Code className="w-5 h-5" />
                    SQL Query
                  </CardTitle>
                  <Button
                    onClick={() => copyToClipboard(query.sql)}
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="mr-2 w-4 h-4" />
                    Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto p-4 text-gray-100 bg-gray-900 rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap break-words">
                    <code>{query.sql}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Explanation Tab */}
          <TabsContent value="explanation" className="space-y-4">
            {query.explanation && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex gap-2 items-center">
                    <FileText className="w-5 h-5" />
                    Technical Explanation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{query.explanation}</p>
                </CardContent>
              </Card>
            )}

            {query.businessLogic && (
              <Card>
                <CardHeader>
                  <CardTitle>Business Logic</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{query.businessLogic}</p>
                </CardContent>
              </Card>
            )}

            {!query.explanation && !query.businessLogic && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <FileText className="mx-auto mb-4 w-12 h-12 opacity-50" />
                  <p>No explanation available for this query.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Execution Tab */}
          <TabsContent value="execution" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex gap-2 items-center">
                    <Play className="w-5 h-5" />
                    Execute Query
                  </CardTitle>
                  <Button
                    onClick={executeQuery}
                    disabled={isExecuting}
                    variant="default"
                  >
                    {isExecuting ? (
                      <>
                        <RefreshCw className="mr-2 w-4 h-4 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 w-4 h-4" />
                        Execute Query
                      </>
                    )}
                  </Button>
                </div>
                <CardDescription>
                  Run this query against the database to see the results
                  (limited to 50 rows)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {executionError && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertDescription>
                      <span className="font-medium">Execution Error: </span>
                      {executionError}
                    </AlertDescription>
                  </Alert>
                )}

                {executionResult && (
                  <div className="space-y-4">
                    <div className="flex gap-4 items-center text-sm text-gray-600">
                      <div className="flex gap-1 items-center">
                        <Clock className="w-4 h-4" />
                        <span>
                          Execution time: {executionResult.executionTime}ms
                        </span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <Database className="w-4 h-4" />
                        <span>Rows returned: {executionResult.rowCount}</span>
                      </div>
                    </div>

                    {executionResult.results.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border">
                        <div className="overflow-x-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {Object.keys(executionResult.results[0]).map(
                                  (column) => (
                                    <TableHead
                                      key={column}
                                      className="whitespace-nowrap"
                                    >
                                      {column}
                                    </TableHead>
                                  )
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executionResult.results.map((row, index) => (
                                <TableRow key={index}>
                                  {Object.values(row).map(
                                    (value, cellIndex) => (
                                      <TableCell
                                        key={cellIndex}
                                        className="whitespace-nowrap"
                                      >
                                        {value !== null && value !== undefined
                                          ? String(value)
                                          : "-"}
                                      </TableCell>
                                    )
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {executionResult.results.length >= 50 && (
                          <div className="p-3 text-sm text-center text-gray-600 bg-gray-50 border-t">
                            Showing first 50 rows of {executionResult.rowCount}{" "}
                            total rows
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-gray-500">
                        <Database className="mx-auto mb-4 w-12 h-12 opacity-50" />
                        <p>No results returned</p>
                      </div>
                    )}
                  </div>
                )}

                {!executionResult && !executionError && !isExecuting && (
                  <div className="py-8 text-center text-gray-500">
                    <Play className="mx-auto mb-4 w-12 h-12 opacity-50" />
                    <p>
                      Click "Execute Query" to run this query and see the
                      results
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
