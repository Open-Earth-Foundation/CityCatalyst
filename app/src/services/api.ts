import { CityAttributes } from "@/models/init-models";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => ({
    getCity: builder.query<CityAttributes, string>({
      query: (locode) => `city/${locode}`,
    }),
    addCity: builder.mutation<CityAttributes, {}>({
      query: (data) => ({
        url: `/city`,
        method: "POST",
        body: data,
      }),
    }),
  }),
});

export const openclimateAPI = createApi({
  reducerPath: "openclimateapi",
  baseQuery: fetchBaseQuery({
    baseUrl: "https://openclimate.openearth.dev",
  }),
  endpoints: (builder) => ({
    getOCtCity: builder.query<any, string>({
      query: (q) => `/api/v1/search/actor?q=${q}`,
    }),
  }),
});

// hooks are automatically generated
export const { useGetCityQuery, useAddCityMutation } = api;
export const { useGetOCtCityQuery } = openclimateAPI;
