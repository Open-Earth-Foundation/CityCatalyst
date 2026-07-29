import { api, openclimateAPI } from "@/services/api";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import cityReducer from "@/features/city/citySlice";
import openclimateCityReducer from "@/features/city/openclimateCitySlice";
import openclimateCityDataReducer from "@/features/city/openclimateCityDataSlice";
import inventoryDataReducer from "@/features/city/inventoryDataSlice";
import organizationReducer from "@/features/organization/organizationSlice";

const reducer = combineReducers({
  inventoryData: inventoryDataReducer,
  [api.reducerPath]: api.reducer,
  [openclimateAPI.reducerPath]: openclimateAPI.reducer,
  city: cityReducer,
  openClimateCity: openclimateCityReducer,
  openClimateCityData: openclimateCityDataReducer,
  organization: organizationReducer,
});

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(api.middleware)
      .concat(openclimateAPI.middleware),
});

// required for refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

// use these in components for type safety
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
