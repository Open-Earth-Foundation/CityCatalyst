import {
  DashboardResponseType,
  GHGInventorySummary,
  HIAPSummary,
} from "@/util/types";

export interface DashboardWidgetProps {
  moduleId: string;
  cityId?: string;
  data: GHGInventorySummary | HIAPSummary;
  isLoading?: boolean;
  error?: string;
  lng: string;
}

export type DashboardWidget = React.FC<DashboardWidgetProps>;
