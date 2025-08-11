import { StageNames } from "@/util/constants";
import { IconType } from "react-icons";
import { CgEye } from "react-icons/cg";
import { BiArrowToRight } from "react-icons/bi";
import { IoMdEye } from "react-icons/io";
import { PlanIcon } from "@/components/icons";

export const stageOrder: StageNames[] = [
  StageNames["Assess And Analyze"],
  StageNames.Plan,
  StageNames.Implement,
  StageNames["Monitor, Evaluate & Report"],
];

// Icon mapping for components that need React icons (like NavigationAccordion)
export const stageIcons: Record<StageNames, IconType> = {
  [StageNames["Assess And Analyze"]]: CgEye,
  [StageNames.Plan]: PlanIcon,
  [StageNames.Implement]: BiArrowToRight,
  [StageNames["Monitor, Evaluate & Report"]]: IoMdEye,
};
