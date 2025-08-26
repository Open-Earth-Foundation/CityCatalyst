import { DashboardResponseType, GHGInventorySummary } from "@/util/types";

export interface DashboardWidgetProps {
  moduleId: string;
  cityId?: string;
  data: GHGInventorySummary | null;
  isLoading?: boolean;
  error?: string;
}

export type DashboardWidget = React.FC<DashboardWidgetProps>;
