import { RootState } from "@/lib/store";
import { OCCityAttributes } from "@/util/types";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface CityState {
  city?: OCCityAttributes;
}

const initialState = {
  city: undefined,
} as CityState;

export const openclimateCitySlice = createSlice({
  name: "openClimateCity",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    set: (state, action: PayloadAction<OCCityAttributes>) => {
      state.city = action.payload;
    },
    clear: (state) => {
      state.city = undefined;
    },
  },
});

export const { clear, set } = openclimateCitySlice.actions;

export const selectCity = (state: RootState) => state.city.city;

export default openclimateCitySlice.reducer;
