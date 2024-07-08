import { RootState } from "@/lib/store";
import { SubSectorAttributes } from "@/models/SubSector";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import stationaryEnergyForm from './data/stationary-form-inputs.json'
import { SubCategory } from "@/models/SubCategory";

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
  subCategories: SubCategory[];
  scopes: ActivityDataScope[];
}

const initialState = {
  subsector: undefined,
  subCategories: [],
  scopes: [{
    scope: 1,
    formInputs: stationaryEnergyForm[1],
    methodologies: [{
      methodologyId: "1",
      methodologyName: 'Fuel Combustion Consumption',
      description: '',
      inputRequired: [""],
      disabled: false,
    },{
      methodologyId: "2",
      methodologyName: 'Scaled sample data',
      description: '',
      inputRequired: [""],
      disabled: false,
     
    },{
      methodologyId: "3",
      methodologyName: 'Modeled data',
      description: '',
      inputRequired: [""],
      disabled: true,
    },{
      methodologyId: "4",
      methodologyName: 'Direct measure',
      description: '',
      inputRequired: [""],
      disabled: false,
    }]
  },{
    scope: 2,
    formInputs: stationaryEnergyForm[2],
    methodologies: [{
      methodologyId: "1",
      methodologyName: 'Energy Consumption',
    },{
      methodologyName: 'Modeled data',
      description: '',
      inputRequired: [""],
    }]
  }]
} as SubsectorState;

export const subsectorSlice = createSlice({
  name: "subsector",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    setSubsector: (state, action: PayloadAction<SubSectorAttributes & {subCatetories: SubCategory[]}>) => {
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
