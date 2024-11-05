import { api, openclimateAPI } from "@/services/api";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import cityReducer from "@/features/city/citySlice";
import openclimateCityReducer from "@/features/city/openclimateCitySlice";
import openclimateCityDataReducer from "@/features/city/openclimateCityDataSlice";
import inventoryDataReducer from "@/features/city/inventoryDataSlice";

import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage";

const reducer = combineReducers({
  inventoryData: inventoryDataReducer,
  [api.reducerPath]: api.reducer,
  [openclimateAPI.reducerPath]: openclimateAPI.reducer,
  city: cityReducer,
  openClimateCity: openclimateCityReducer,
  openClimateCityData: openclimateCityDataReducer,
});

const persistConfig = {
  key: "root",
  version: 1,
  storage,
  blacklist: ["api", "subsector"],
};

const persistedReducer = persistReducer(persistConfig, reducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    })
      .concat(api.middleware)
      .concat(openclimateAPI.middleware),
});

export const persistor = persistStore(store);

// required for refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

// use these in components for type safety
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
