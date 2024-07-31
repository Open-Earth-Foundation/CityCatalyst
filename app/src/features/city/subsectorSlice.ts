import { RootState } from "@/lib/store";
import { SubSectorAttributes } from "@/models/SubSector";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { SubCategory, SubCategoryAttributes } from "@/models/SubCategory";
import { manualInputHierarchySchema } from "@/util/form-schema";

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
  manualInputSchema: any
}

const initialState = {
  subsector: undefined,
  manualInputSchema: manualInputHierarchySchema
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
