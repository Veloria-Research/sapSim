import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ParameterControls } from './ParameterControls'
import { 
  MessageSquare, 
  Settings, 
  Database, 
  Brain, 
  History,
  FileText,
  BarChart3,
  Zap
} from 'lucide-react'

export interface QueryParameters {
  businessDomain: string
  preferredComplexity: 'simple' | 'medium' | 'complex'
  includeExplanation: boolean
  maxTables: number
  outputFormat: 'sql' | 'explanation' | 'both'
  preferredJoinType: 'inner' | 'left' | 'right' | 'full'
  useGroundTruth: boolean
  useSchemaSummary: boolean
  useTableRelationships: boolean
  useColumnMetadata: boolean
}

interface AppSidebarProps {
  activeView: string
  onViewChange: (view: string) => void
  parameters: QueryParameters
  onParametersChange: (parameters: QueryParameters) => void
}

export function AppSidebar({ activeView, onViewChange, parameters, onParametersChange }: AppSidebarProps) {
  const navigationItems = [
    { id: 'query', label: 'Query Interface', icon: MessageSquare },
    { id: 'pipeline', label: 'AI Pipeline', icon: Brain },
    { id: 'history', label: 'Query History', icon: History },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'schema', label: 'Schema Explorer', icon: Database },
    { id: 'docs', label: 'Documentation', icon: FileText },
  ]



  return (
    <div className="w-80 h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">SAP AI Sim</h2>
        </div>
        <p className="text-sm text-gray-600">AI-powered SAP query generation</p>
      </div>

      {/* Navigation */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Navigation</h3>
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            )
          })}
        </nav>
      </div>

      <Separator />

      {/* Parameters Section */}
      <div className="flex-1 overflow-y-auto">
        <ParameterControls 
          parameters={parameters} 
          onParametersChange={onParametersChange} 
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          SAP AI Simulation v1.0
        </div>
      </div>
    </div>
  )
}