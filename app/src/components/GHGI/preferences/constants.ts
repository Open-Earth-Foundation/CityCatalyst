const BASE_PATH = "/assets/preferences/";
const WASTE_PATH = `${BASE_PATH}waste/`;
const TRANSPORTATION_PATH = `${BASE_PATH}transportation/`;
const ACTIVITIES_PATH = `${BASE_PATH}activities/`;

export const ACTIVITY_ITEMS = [
  {
    id: "commercial-and-institutional",
    icon: `${ACTIVITIES_PATH}commercial-institutional.svg`,
  },
  {
    id: "manufacturing-industries",
    icon: `${ACTIVITIES_PATH}manufacturing.svg`,
  },
  {
    id: "construction",
    icon: `${ACTIVITIES_PATH}construction.svg`,
  },
  {
    id: "agriculture",
    icon: `${ACTIVITIES_PATH}agriculture.svg`,
  },
  { id: "forestry", icon: `${ACTIVITIES_PATH}forestry.svg` },
  { id: "fishing", icon: `${ACTIVITIES_PATH}fishing.svg` },
  {
    id: "power-generation-plants",
    icon: `${ACTIVITIES_PATH}power.svg`,
  },
  { id: "oil-or-gas", icon: `${ACTIVITIES_PATH}oil-gas.svg` },
  { id: "coal", icon: `${ACTIVITIES_PATH}coal.svg` },
];

export const TRANSPORTATION_ITEMS = [
  {
    id: "passenger",
    icon: `${TRANSPORTATION_PATH}passenger.svg`,
  },
  {
    id: "commercial",
    icon: `${TRANSPORTATION_PATH}commercial.svg`,
  },
  {
    id: "public",
    icon: `${TRANSPORTATION_PATH}public.svg`,
  },
  {
    id: "railways",
    icon: `${TRANSPORTATION_PATH}railways.svg`,
  },
  { id: "aviation", icon: `${TRANSPORTATION_PATH}aviation.svg` },
  {
    id: "waterborne",
    icon: `${TRANSPORTATION_PATH}waterborne.svg`,
  },
];

export const WASTE_ITEMS = [
  {
    id: "controlled-landfill",
    icon: `${WASTE_PATH}controlled-landfill.svg`,
  },
  {
    id: "uncontrolled-landfill",
    icon: `${WASTE_PATH}uncontrolled-landfill.svg`,
  },
  {
    id: "open-air-landfill",
    icon: `${WASTE_PATH}open-air-landfill.svg`,
  },
  { id: "incineration", icon: `${WASTE_PATH}incineration.svg` },
  {
    id: "biological-treatment",
    icon: `${WASTE_PATH}biological-treatment.svg`,
  },
  {
    id: "wastewater-treatment",
    icon: `${WASTE_PATH}wastewater-treatment.svg`,
  },
  {
    id: "collected-untreated",
    icon: `${WASTE_PATH}collected-untreated.svg`,
  },
  {
    id: "uncollected-untreated",
    icon: `${WASTE_PATH}uncollected-untreated.svg`,
  },
];

export const LINKS = ["preferences/activities", "transportation", "waste"];
