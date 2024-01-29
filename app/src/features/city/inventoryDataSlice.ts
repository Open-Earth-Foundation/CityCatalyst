import { RootState } from "@/lib/store";
import { CityAttributes } from "@/models/City";
import { UserFileAttributes } from "@/models/UserFile";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface inventoryDataState {
  file?: UserFileAttributes;
}

const initialState = {
  file: undefined,
} as inventoryDataState;

export const inventoryDataSlice = createSlice({
  name: "inventoryData",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    set: (state, action: PayloadAction<UserFileAttributes>) => {
      state.file = action.payload;
    },
    clear: (state) => {
      state.file = undefined;
    },
  },
});

export const { clear } = inventoryDataSlice.actions;

export const selectInventoryData = (state: RootState) => state.inventoryData;

export default inventoryDataSlice.reducer;
