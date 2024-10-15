import { MdOutlineHomeWork } from "react-icons/md";
import { FiTrash2, FiTruck } from "react-icons/fi";

export const SECTORS = [
  {
    sectorName: "stationary-energy",
    testId: "stationary-energy-sector-card",
    descriptionText: "stationary-energy-details",
    scope: "stationary-energy-scope",
    icon: MdOutlineHomeWork,
    step: 1,
  },
  {
    sectorName: "transportation",
    testId: "transportation-sector-card",
    descriptionText: "transportation-details",
    scope: "transportation-scope",
    icon: FiTruck,
    step: 2,
  },
  {
    sectorName: "waste",
    testId: "waste-sector-card",
    descriptionText: "waste-details",
    scope: "waste-scope",
    icon: FiTrash2,
    step: 3,
  },
];
