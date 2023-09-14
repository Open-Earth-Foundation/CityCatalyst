import { RootState } from "@/lib/store";
import { CityAttributes } from "@/models/City";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface CityState {
  city?: CityAttributes;
}

const initialState = {
  city: undefined,
} as CityState;

export const citySlice = createSlice({
  name: "city",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    set: (state, action: PayloadAction<CityAttributes>) => {
      state.city = action.payload;
    },
    clear: (state) => {
      state.city = undefined;
    },
  },
});

export const { clear } = citySlice.actions;

export const selectCity = (state: RootState) => state.city.city;

export default citySlice.reducer;
