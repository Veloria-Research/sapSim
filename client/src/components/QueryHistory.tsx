import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Eye,
  Calendar,
  Database,
  Clock,
  Filter,
  RefreshCw,
} from "lucide-react";
import { QueryDetailModal } from "./QueryDetailModal";

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

interface QueryHistoryProps {
  className?: string;
}

export function QueryHistory({ className }: QueryHistoryProps) {
  const [queries, setQueries] = useState<QueryHistory[]>([]);
  const [filteredQueries, setFilteredQueries] = useState<QueryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedComplexity, setSelectedComplexity] = useState<string>("all");
  const [selectedValidation, setSelectedValidation] = useState<string>("all");
  const [selectedQuery, setSelectedQuery] = useState<QueryHistory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load query history
  const loadQueryHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        "http://localhost:3001/api/query/history?limit=100"
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setQueries(data.data || []);
        setFilteredQueries(data.data || []);
      } else {
        throw new Error(data.error || "Failed to load query history");
      }
    } catch (err) {
      console.error("Failed to load query history:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load query history"
      );
    } finally {
      setLoading(false);
    }
  };

  // Filter queries based on search and filters
  useEffect(() => {
    let filtered = queries;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (query) =>
          query.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
          query.sql.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Complexity filter
    if (selectedComplexity !== "all") {
      filtered = filtered.filter(
        (query) => query.complexity === selectedComplexity
      );
    }

    // Validation status filter
    if (selectedValidation !== "all") {
      filtered = filtered.filter(
        (query) => query.validationStatus === selectedValidation
      );
    }

    setFilteredQueries(filtered);
  }, [queries, searchTerm, selectedComplexity, selectedValidation]);

  // Load data on component mount
  useEffect(() => {
    loadQueryHistory();
  }, []);

  // Handle view query details
  const handleViewQuery = (query: QueryHistory) => {
    setSelectedQuery(query);
    setIsModalOpen(true);
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

  // Get badge variant for complexity
  const getComplexityBadgeVariant = (complexity: string) => {
    switch (complexity) {
      case "simple":
        return "secondary";
      case "medium":
        return "default";
      case "complex":
        return "destructive";
      default:
        return "outline";
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get unique values for filters
  const complexityOptions = [...new Set(queries.map((q) => q.complexity))];
  const validationOptions = [
    ...new Set(queries.map((q) => q.validationStatus)),
  ];

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex justify-center items-center py-8">
          <RefreshCw className="mr-2 w-6 h-6 animate-spin" />
          <span>Loading query history...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8">
          <div className="text-center text-red-600">
            <p className="mb-4">Error loading query history: {error}</p>
            <Button onClick={loadQueryHistory} variant="outline">
              <RefreshCw className="mr-2 w-4 h-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex gap-2 items-center">
                <Database className="w-5 h-5" />
                Query History
              </CardTitle>
              <CardDescription>
                View and manage all generated SQL queries (
                {filteredQueries.length} of {queries.length} queries)
              </CardDescription>
            </div>
            <Button onClick={loadQueryHistory} variant="outline" size="sm">
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 w-4 h-4 text-gray-400 transform -translate-y-1/2" />
              <Input
                placeholder="Search queries by prompt or SQL..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedComplexity}
                onChange={(e) => setSelectedComplexity(e.target.value)}
                className="px-3 py-2 text-sm rounded-md border border-gray-300"
              >
                <option value="all">All Complexity</option>
                {complexityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={selectedValidation}
                onChange={(e) => setSelectedValidation(e.target.value)}
                className="px-3 py-2 text-sm rounded-md border border-gray-300"
              >
                <option value="all">All Status</option>
                {validationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Query Table */}
          {filteredQueries.length > 0 ? (
            <div className="text-left rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Complexity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Tables</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueries.map((query) => (
                    <TableRow key={query.id}>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={query.prompt}>
                          {query.prompt}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getComplexityBadgeVariant(query.complexity)}
                        >
                          {query.complexity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getValidationBadgeVariant(
                            query.validationStatus
                          )}
                        >
                          {query.validationStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {(query.confidence * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {query.tablesUsed?.slice(0, 2).map((table, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="text-xs"
                            >
                              {table}
                            </Badge>
                          ))}
                          {query.tablesUsed?.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{query.tablesUsed.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 items-center text-sm text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(query.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleViewQuery(query)}
                          variant="outline"
                          size="sm"
                        >
                          <Eye className="mr-1 w-4 h-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">
              <Database className="mx-auto mb-4 w-12 h-12 opacity-50" />
              <p className="mb-2 text-lg font-medium">No queries found</p>
              <p className="text-sm">
                {queries.length === 0
                  ? "No queries have been generated yet."
                  : "No queries match your current filters."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query Detail Modal */}
      <QueryDetailModal
        query={selectedQuery}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedQuery(null);
        }}
      />
    </>
  );
}
