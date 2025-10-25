import { useState } from 'react'
import { AppSidebar, type QueryParameters } from './AppSidebar'
import { EnhancedQueryInterface } from './EnhancedQueryInterface'

const defaultParameters: QueryParameters = {
  businessDomain: 'sales',
  preferredComplexity: 'medium',
  includeExplanation: true,
  maxTables: 5,
  outputFormat: 'both',
  preferredJoinType: 'inner',
  useGroundTruth: true,
  useSchemaSummary: true,
  useTableRelationships: true,
  useColumnMetadata: true,
}

export function MainLayout() {
  const [activeView, setActiveView] = useState('query')
  const [parameters, setParameters] = useState<QueryParameters>(defaultParameters)

  const renderActiveView = () => {
    switch (activeView) {
      case 'query':
        return <EnhancedQueryInterface parameters={parameters} />
      case 'pipeline':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">AI Pipeline</h1>
            <p className="text-gray-600">AI Pipeline view coming soon...</p>
          </div>
        )
      case 'history':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Query History</h1>
            <p className="text-gray-600">Query history view coming soon...</p>
          </div>
        )
      case 'analytics':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Analytics</h1>
            <p className="text-gray-600">Analytics view coming soon...</p>
          </div>
        )
      case 'schema':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Schema Explorer</h1>
            <p className="text-gray-600">Schema explorer view coming soon...</p>
          </div>
        )
      case 'docs':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Documentation</h1>
            <p className="text-gray-600">Documentation view coming soon...</p>
          </div>
        )
      default:
        return <EnhancedQueryInterface parameters={parameters} />
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        parameters={parameters}
        onParametersChange={setParameters}
      />
      <main className="flex-1 overflow-hidden">
        <div className="h-full p-6 overflow-y-auto">
          {renderActiveView()}
        </div>
      </main>
    </div>
  )
}