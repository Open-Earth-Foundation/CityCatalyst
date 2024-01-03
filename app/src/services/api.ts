import {
  type UserAttributes,
  type CityAttributes,
  type InventoryAttributes,
  type SubSectorValueAttributes,
  type InventoryValueAttributes,
  PopulationAttributes,
} from "@/models/init-models";
import type {
  ConnectDataSourceQuery,
  ConnectDataSourceResponse,
  DataSourceResponse,
  InventoryProgressResponse,
  InventoryResponse,
  SubCategoryValueUpdateQuery,
  SubSectorValueResponse,
  InventoryWithCity,
  UserInfoResponse,
  SubSectorValueUpdateQuery,
} from "@/util/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "api",
  tagTypes: [
    "UserInfo",
    "InventoryProgress",
    "UserInventories",
    "SubSectorValue",
    "SubCategoryValue",
  ],
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
      transformResponse: (response: { data: InventoryResponse }) =>
        response.data,
    }),
    getInventoryProgress: builder.query<
      InventoryProgressResponse,
      { locode: string; year: number }
    >({
      query: ({ locode, year }) => `city/${locode}/inventory/${year}/progress`,
      transformResponse: (response: { data: InventoryProgressResponse }) =>
        response.data,
      providesTags: ["InventoryProgress"],
    }),
    addCity: builder.mutation<
      CityAttributes,
      {
        name: string;
        locode: string;
        area: number;
        region: string;
        country: string;
      }
    >({
      query: (data) => ({
        url: `/city`,
        method: "POST",
        body: data,
      }),
    }),
    addInventory: builder.mutation<
      InventoryAttributes,
      { locode: string; year: number; inventoryName: string }
    >({
      query: (data) => ({
        url: `/city/${data.locode}/inventory`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["UserInventories"],
    }),
    setUserInfo: builder.mutation<
      UserAttributes,
      { defaultCityLocode: string; defaultInventoryYear: number }
    >({
      query: (data) => ({
        url: "/user",
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: ["UserInfo"],
    }),
    getUserInfo: builder.query<UserInfoResponse, void>({
      query: () => "/user",
      transformResponse: (response: { data: UserInfoResponse }) =>
        response.data,
      providesTags: ["UserInfo"],
    }),
    getAllDataSources: builder.query<
      DataSourceResponse,
      { inventoryId: string }
    >({
      query: ({ inventoryId }) => `datasource/${inventoryId}`,
      transformResponse: (response: { data: DataSourceResponse }) =>
        response.data,
    }),
    getSubsectorValue: builder.query<
      SubSectorValueResponse,
      { subSectorId: string; inventoryId: string }
    >({
      query: ({ subSectorId, inventoryId }) =>
        `/inventory/${inventoryId}/subsector/${subSectorId}`,
      transformResponse: (response: { data: SubSectorValueResponse }) =>
        response.data,
      providesTags: ["SubSectorValue"],
    }),
    setSubsectorValue: builder.mutation<
      SubSectorValueAttributes,
      SubSectorValueUpdateQuery
    >({
      query: (data) => ({
        url: `/inventory/${data.inventoryId}/subsector/${data.subSectorId}`,
        method: "PATCH",
        body: data.data,
      }),
      transformResponse: (response: { data: SubSectorValueAttributes }) =>
        response.data,
      invalidatesTags: ["InventoryProgress", "SubSectorValue"],
    }),
    setSubCategoryValue: builder.mutation<
      InventoryValueAttributes,
      SubCategoryValueUpdateQuery
    >({
      query: (data) => ({
        url: `/inventory/${data.inventoryId}/subcategory/${data.subCategoryId}`,
        method: "PATCH",
        body: data.data,
      }),
      transformResponse: (response: { data: InventoryValueAttributes }) =>
        response.data,
      invalidatesTags: ["SubCategoryValue", "SubSectorValue"],
    }),
    connectDataSource: builder.mutation<
      ConnectDataSourceResponse,
      ConnectDataSourceQuery
    >({
      query: (data) => ({
        url: `/datasource/${data.inventoryId}`,
        method: "POST",
        body: { dataSourceIds: data.dataSourceIds },
      }),
      transformResponse: (response: { data: ConnectDataSourceResponse }) =>
        response.data,
      invalidatesTags: ["InventoryProgress"],
    }),
    getUserInventories: builder.query<InventoryWithCity[], void>({
      query: () => "/user/inventories",
      transformResponse: (response: { data: InventoryWithCity[] }) =>
        response.data,
      providesTags: ["UserInventories"],
    }),
    addCityPopulation: builder.mutation<
      PopulationAttributes,
      {
        cityId: string;
        population: number;
        year: number;
        locode: string;
      }
    >({
      query: (data) => {
        return {
          url: `/city/${data.locode}/population`,
          method: `POST`,
          body: data,
        };
      },
    }),
    getCityPopulation: builder.query<
      PopulationAttributes,
      {
        year: number;
        locode: string;
      }
    >({
      query: (data) => `/city/${data.locode}/population/${data.year}`,
      transformResponse: (response: { data: PopulationAttributes }) =>
        response.data,
    }),
  }),
});

export const openclimateAPI = createApi({
  reducerPath: "openclimateapi",
  baseQuery: fetchBaseQuery({
    baseUrl:
      process.env.NODE_ENV === "production"
        ? "https://app.openclimate.network"
        : "https://openclimate.openearth.dev",
  }),
  endpoints: (builder) => ({
    getOCCity: builder.query<any, string>({
      query: (q) => `/api/v1/search/actor?q=${q}`,
      transformResponse: (response: any) => {
        return response.data.filter((item: any) => item.type === "city");
      },
    }),
    getOCCityData: builder.query<any, string>({
      query: (locode) => `/api/v1/actor/${locode}`,
    }),
  }),
});

// Global API URL

export const GLOBAL_API_URL =
  process.env.GLOBAL_API_URL || "https://api.citycatalyst.io";

// hooks are automatically generated
export const {
  useGetCityQuery,
  useAddCityMutation,
  useAddInventoryMutation,
  useSetUserInfoMutation,
  useAddCityPopulationMutation,
  useGetCityPopulationQuery,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
