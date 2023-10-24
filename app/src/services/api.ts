import {
  UserAttributes,
  type CityAttributes,
  type InventoryAttributes,
} from "@/models/init-models";
import type {
  InventoryProgressResponse,
  InventoryResponse,
} from "@/util/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => ({
    getCity: builder.query<CityAttributes, string>({
      query: (locode) => `city/${locode}`,
      transformResponse: (response: { data: CityAttributes }) => response.data,
    }),
    getCityBoundary: builder.query<GeoJSON.GeoJSON, string>({
      query: (locode) => `city/${locode}/boundary`,
      transformResponse: (response: { data: GeoJSON.GeoJSON }) => response.data,
    }),
    getInventory: builder.query<
      InventoryResponse,
      { locode: string; year: number }
    >({
      query: ({ locode, year }) => `city/${locode}/inventory/${year}`,
      transformResponse: (response: { data: InventoryAttributes }) =>
        response.data,
    }),
    getInventoryProgress: builder.query<
      InventoryProgressResponse,
      { locode: string; year: number }
    >({
      query: ({ locode, year }) => `city/${locode}/inventory/${year}/progress`,
      transformResponse: (response: { data: InventoryProgressResponse }) =>
        response.data,
    }),
    addCity: builder.mutation<CityAttributes, { name: string; locode: string }>(
      {
        query: (data) => ({
          url: `/city`,
          method: "POST",
          body: data,
        }),
      },
    ),
    addInventory: builder.mutation<
      InventoryAttributes,
      { locode: string; year: number }
    >({
      query: (data) => ({
        url: `/city/${data.locode}/inventory`,
        method: "POST",
        body: data,
      }),
    }),
    setUserInfo: builder.mutation<
      UserAttributes,
      { defaultCityLocode: string; defaultInventoryYear: number }
    >({
      query: (data) => ({
        url: `/user`,
        method: "PATCH",
        body: data,
      }),
    }),
  }),
});

export const openclimateAPI = createApi({
  reducerPath: "openclimateapi",
  baseQuery: fetchBaseQuery({
    baseUrl:
      process.env.NODE_ENV === "production"
        ? "https://openclimate.network"
        : "https://openclimate.openearth.dev",
  }),
  endpoints: (builder) => ({
    getOCCity: builder.query<any, string>({
      query: (q) => `/api/v1/search/actor?q=${q}`,
    }),
  }),
});

// hooks are automatically generated
export const {
  useGetCityQuery,
  useAddCityMutation,
  useAddInventoryMutation,
  useSetUserInfoMutation,
} = api;
export const { useGetOCCityQuery } = openclimateAPI;
