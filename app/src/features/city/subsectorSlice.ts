import { RootState } from "@/lib/store";
import { SubSectorAttributes } from "@/models/SubSector";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface SubsectorState {
  subsector?: SubSectorAttributes;
}

const initialState = {
  city: undefined,
} as SubsectorState;

export const subsectorSlice = createSlice({
  name: "subsector",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    setSubsector: (state, action: PayloadAction<SubSectorAttributes>) => {
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
