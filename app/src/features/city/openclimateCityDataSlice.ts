import { RootState } from "@/lib/store";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

export interface CityDataAttributes {
  locode: string;
  name: string;
  region: string;
  country: string;
  area: number;
}

interface CityDataState {
  city?: CityDataAttributes;
}

const initialState = {
  city: undefined,
} as CityDataState;

export const openclimateCityDataSlice = createSlice({
  name: "openClimateCityData",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    set: (state, action: PayloadAction<CityDataAttributes>) => {
      state.city = action.payload;
    },
    clear: (state) => {
      state.city = undefined;
    },
  },
});

export const { clear, set } = openclimateCityDataSlice.actions;

export const selectCity = (state: RootState) => state.city;

export default openclimateCityDataSlice.reducer;
