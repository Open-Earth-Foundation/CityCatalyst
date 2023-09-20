import { api, openclimateAPI } from "@/services/api";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import cityReducer from "@/features/city/citySlice";
import openclimateCityReducer from "@/features/city/openclimateCitySlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    [openclimateAPI.reducerPath]: openclimateAPI.reducer,
    city: cityReducer,
    openclimatecity: openclimateCityReducer,
  },
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
