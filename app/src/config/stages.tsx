import { StageNames } from "@/util/constants";
import { IconType } from "react-icons";
import { MdInsights, MdKeyboardTab, MdVisibility } from "react-icons/md";
import { PlanIcon } from "@/components/icons";

export const stageOrder: StageNames[] = [
  StageNames["Assess And Analyze"],
  StageNames.Plan,
  StageNames.Implement,
  StageNames["Monitor, Evaluate & Report"],
];

// Icon mapping for components that need React icons (like NavigationAccordion)
export const stageIcons: Record<StageNames, IconType> = {
  [StageNames["Assess And Analyze"]]: MdInsights,
  [StageNames.Plan]: PlanIcon,
  [StageNames.Implement]: MdKeyboardTab,
  [StageNames["Monitor, Evaluate & Report"]]: MdVisibility,
};
