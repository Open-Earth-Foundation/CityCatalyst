import { RootState } from "@/lib/store";
import { SubSectorAttributes } from "@/models/SubSector";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { SubCategory, SubCategoryAttributes } from "@/models/SubCategory";
import { type SectorFormSchema } from "@/util/form-schema";

export type Methodology = {
  methodologyId:string,
  methodologyName: string,
  description: string,
  inputRequired: string[],
  disabled:boolean,
}

export type ActivityDataScope = {
  scope: number,
  formInputs: any,
  methodologies: Methodology[]

}

interface SubsectorState {
  subsector?: SubSectorAttributes;
  subCategories: SubCategoryAttributes[];
  scopes: ActivityDataScope[];
}

const initialState = {
  subsector: undefined,
  subCategories: [],
  scopes: [{
    scope: 1,
    formInputs: SectorFormSchema,
    methodologies: [{
      methodologyId: "1",
      methodologyName: 'Fuel Combustion Consumption',
      description: 'Direct recording of fuels combusted in commercial buildings',
      inputRequired: ["Total fuel consumed amount"],
      disabled: false,
    },{
      methodologyId: "2",
      methodologyName: 'Scaled sample data',
      description: 'Extrapolates emissions from a representative sample of buildings.',
      inputRequired: ["Sample fuel consumed amount", "Scaling data (population, GDP, area, etc.) for sample and city level"],
      disabled: false,
     
    },{
      methodologyId: "3",
      methodologyName: 'Modeled data',
      description: 'Emissions estimated from predictive models.',
      inputRequired: ["Modeled fuel intensity consumption", "Build area"],
      disabled: true,
    },{
      methodologyId: "4",
      methodologyName: 'Direct measure',
      description: "Direct emission measurements from commercial buildings' combustion sources.",
      inputRequired: ["Emissions data"],
      disabled: false,
    }]
  },{
    scope: 2,
    formInputs: SectorFormSchema,
    methodologies: [{
      methodologyId: "1",
      methodologyName: 'Energy Consumption',
      description: "Direct recording of fuels combusted in commercial buildings",

    },{
      methodologyId: "2",
      methodologyName: 'Scaled sample data',
      description: 'Extrapolates emissions from a representative sample of buildings.',
      inputRequired: ["Sample fuel consumed amount", "Scaling data (population, GDP, area, etc.) for sample and city level"],
      disabled: false,
     
    },{
      methodologyId: "3",
      methodologyName: 'Modeled data',
      description: 'Emissions estimated from predictive models.',
      inputRequired: ["Modeled fuel intensity consumption", "Build area"],
      disabled: true,
    },{
      methodologyId: "4",
      methodologyName: 'Direct measure',
      description: "Direct emission measurements from commercial buildings' combustion sources.",
      inputRequired: ["Emissions data"],
      disabled: false,
    }]
  }]
} as SubsectorState;

export const subsectorSlice = createSlice({
  name: "subsector",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    setSubsector: (state, action: PayloadAction<SubSectorAttributes & {subCategories: SubCategoryAttributes[]}>) => {
      state.subsector = action.payload;
    },
    clearSubsector: (state) => {
      state.subsector = undefined;
    },
  },
});

export const { clearSubsector, setSubsector } = subsectorSlice.actions;

export const selectSubsector = (state: RootState) => state.subsector.subsector;

export default subsectorSlice.reducer;
