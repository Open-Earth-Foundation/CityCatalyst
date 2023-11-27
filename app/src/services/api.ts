import type {
  UserAttributes,
  CityAttributes,
  InventoryAttributes,
  SubSectorValueAttributes,
  SubCategoryValueAttributes,
} from "@/models/init-models";
import type {
  ConnectDataSourceQuery,
  ConnectDataSourceResponse,
  DataSourceResponse,
  InventoryProgressResponse,
  InventoryResponse,
  SubCategoryValueUpdateQuery,
  SubsectorValueUpdateQuery,
  UserInfoResponse,
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
    }),
    getUserInfo: builder.query<UserInfoResponse, void>({
      query: () => "/user",
      transformResponse: (response: { data: UserInfoResponse }) =>
        response.data,
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
      SubSectorValueAttributes,
      { subSectorId: string; inventoryId: string }
    >({
      query: ({ subSectorId, inventoryId }) =>
        `/inventory/${inventoryId}/subsector/${subSectorId}`,
      transformResponse: (response: { data: SubSectorValueAttributes }) =>
        response.data,
    }),
    setSubsectorValue: builder.mutation<
      SubSectorValueAttributes,
      SubsectorValueUpdateQuery
    >({
      query: (data) => ({
        url: `/inventory/${data.inventoryId}/subsector/${data.subSectorId}`,
        method: "PATCH",
        body: data.data,
      }),
      transformResponse: (response: { data: SubSectorValueAttributes }) =>
        response.data,
    }),
    setSubCategoryValue: builder.mutation<
      SubCategoryValueAttributes,
      SubCategoryValueUpdateQuery
    >({
      query: (data) => ({
        url: `/inventory/${data.inventoryId}/subcategory/${data.subCategoryId}`,
        method: "PATCH",
        body: data.data,
      }),
      transformResponse: (response: { data: SubCategoryValueAttributes }) =>
        response.data,
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
  process.env.CC_ENV === "production"
    ? "https://ccglobal.citycatalyst.io"
    : "https://ccglobal.openearth.dev";

// hooks are automatically generated
export const {
  useGetCityQuery,
  useAddCityMutation,
  useAddInventoryMutation,
  useSetUserInfoMutation,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
