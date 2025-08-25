// Simple types for module widgets
export interface DashboardWidgetProps {
  moduleId: string;
  data: any; // Data from dashboard endpoint for this module
  isLoading?: boolean;
  error?: string;
}

export type DashboardWidget = React.FC<DashboardWidgetProps>;