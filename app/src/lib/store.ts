import { api } from "@/services/api";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import cityReducer from "@/slices/citySlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    city: cityReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

// required for refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

// use these in components for type safety
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
