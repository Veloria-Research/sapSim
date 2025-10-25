import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, Brain, FileText } from "lucide-react";
import { type QueryParameters } from "./AppSidebar";

interface ParameterControlsProps {
  parameters: QueryParameters;
  onParametersChange: (parameters: QueryParameters) => void;
}

export function ParameterControls({
  parameters,
  onParametersChange,
}: ParameterControlsProps) {
  const updateParameter = <K extends keyof QueryParameters>(
    key: K,
    value: QueryParameters[K]
  ) => {
    onParametersChange({ ...parameters, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Query Context Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-sm">
            <Settings className="w-4 h-4" />
            Query Context
          </CardTitle>
          <CardDescription className="text-xs">
            Configure how the AI interprets your queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessDomain" className="text-xs font-medium">
              Business Domain
            </Label>
            <Select
              value={parameters.businessDomain}
              onValueChange={(value) =>
                updateParameter("businessDomain", value)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="procurement">Procurement</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="hr">Human Resources</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="complexity" className="text-xs font-medium">
              Query Complexity:{" "}
              <Badge variant="outline" className="text-xs">
                {parameters.preferredComplexity}
              </Badge>
            </Label>
            <Select
              value={parameters.preferredComplexity}
              onValueChange={(value) =>
                updateParameter(
                  "preferredComplexity",
                  value as "simple" | "medium" | "complex"
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="complex">Complex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outputFormat" className="text-xs font-medium">
              Output Format
            </Label>
            <Select
              value={parameters.outputFormat}
              onValueChange={(value) =>
                updateParameter(
                  "outputFormat",
                  value as "sql" | "explanation" | "both"
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sql">SQL Only</SelectItem>
                <SelectItem value="explanation">With Explanation</SelectItem>
                <SelectItem value="both">Both SQL & Explanation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Database Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-sm">
            <Database className="w-4 h-4" />
            Database Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Control query scope and join preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxTables" className="text-xs font-medium">
              Max Tables:{" "}
              <Badge variant="outline" className="text-xs">
                {parameters.maxTables}
              </Badge>
            </Label>
            <Slider
              value={[parameters.maxTables]}
              onValueChange={(value) => updateParameter("maxTables", value[0])}
              max={10}
              min={1}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="joinType" className="text-xs font-medium">
              Preferred Join Type
            </Label>
            <Select
              value={parameters.preferredJoinType}
              onValueChange={(value) =>
                updateParameter(
                  "preferredJoinType",
                  value as "inner" | "left" | "right" | "full"
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inner">Inner Join</SelectItem>
                <SelectItem value="left">Left Join</SelectItem>
                <SelectItem value="right">Right Join</SelectItem>
                <SelectItem value="full">Full Outer Join</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* AI Enhancement Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-sm">
            <Brain className="w-4 h-4" />
            AI Enhancements
          </CardTitle>
          <CardDescription className="text-xs">
            Enable advanced AI features for better results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <Label htmlFor="includeExplanation" className="text-xs font-medium">
              Include Explanation
            </Label>
            <Switch
              id="includeExplanation"
              checked={parameters.includeExplanation}
              onCheckedChange={(checked) =>
                updateParameter("includeExplanation", checked)
              }
            />
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <Label htmlFor="useGroundTruth" className="text-xs font-medium">
              Use Ground Truth
            </Label>
            <Switch
              id="useGroundTruth"
              checked={parameters.useGroundTruth}
              onCheckedChange={(checked) =>
                updateParameter("useGroundTruth", checked)
              }
            />
          </div>

          <div className="flex justify-between items-center">
            <Label htmlFor="useSchemaSummary" className="text-xs font-medium">
              Use Schema Summary
            </Label>
            <Switch
              id="useSchemaSummary"
              checked={parameters.useSchemaSummary}
              onCheckedChange={(checked) =>
                updateParameter("useSchemaSummary", checked)
              }
            />
          </div>

          <div className="flex justify-between items-center">
            <Label
              htmlFor="useTableRelationships"
              className="text-xs font-medium"
            >
              Use Table Relationships
            </Label>
            <Switch
              id="useTableRelationships"
              checked={parameters.useTableRelationships}
              onCheckedChange={(checked) =>
                updateParameter("useTableRelationships", checked)
              }
            />
          </div>

          <div className="flex justify-between items-center">
            <Label htmlFor="useColumnMetadata" className="text-xs font-medium">
              Use Column Metadata
            </Label>
            <Switch
              id="useColumnMetadata"
              checked={parameters.useColumnMetadata}
              onCheckedChange={(checked) =>
                updateParameter("useColumnMetadata", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-sm">
            <FileText className="w-4 h-4" />
            Quick Presets
          </CardTitle>
          <CardDescription className="text-xs">
            Apply common parameter configurations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            onClick={() =>
              onParametersChange({
                businessDomain: "finance",
                preferredComplexity: "simple",
                maxTables: 3,
                outputFormat: "sql",
                preferredJoinType: "inner",
                includeExplanation: false,
                useGroundTruth: true,
                useSchemaSummary: true,
                useTableRelationships: true,
                useColumnMetadata: false,
              })
            }
            className="p-2 w-full text-xs text-left rounded border transition-colors hover:bg-gray-50"
          >
            <div className="font-medium">Quick Query</div>
            <div className="text-muted-foreground">Fast, simple queries</div>
          </button>

          <button
            onClick={() =>
              onParametersChange({
                businessDomain: "general",
                preferredComplexity: "complex",
                maxTables: 8,
                outputFormat: "both",
                preferredJoinType: "left",
                includeExplanation: true,
                useGroundTruth: true,
                useSchemaSummary: true,
                useTableRelationships: true,
                useColumnMetadata: true,
              })
            }
            className="p-2 w-full text-xs text-left rounded border transition-colors hover:bg-gray-50"
          >
            <div className="font-medium">Deep Analysis</div>
            <div className="text-muted-foreground">Comprehensive analysis</div>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
