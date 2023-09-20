import { RootState } from "@/lib/store";
import { OCCityArributes } from "@/models/City";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface CityState {
  city?: OCCityArributes;
}

const initialState = {
  city: undefined,
} as CityState;

export const openclimateCitySlice = createSlice({
  name: "openclimatecity",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    set: (state, action: PayloadAction<OCCityArributes>) => {
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
