import {
  type UserAttributes,
  type CityAttributes,
  type InventoryAttributes,
  type InventoryValueAttributes,
  PopulationAttributes,
} from "@/models/init-models";
import type { BoundingBox } from "@/util/geojson";
import type {
  ConnectDataSourceQuery,
  ConnectDataSourceResponse,
  DataSourceResponse,
  InventoryProgressResponse,
  InventoryResponse,
  InventoryValueUpdateQuery,
  InventoryValueResponse,
  InventoryWithCity,
  UserInfoResponse,
} from "@/util/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "api",
  tagTypes: [
    "UserInfo",
    "InventoryProgress",
    "UserInventories",
    "SubSectorValue",
    "InventoryValue",
    "UserData",
  ],
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => ({
    getCity: builder.query<CityAttributes, string>({
      query: (locode) => `city/${locode}`,
      transformResponse: (response: { data: CityAttributes }) => response.data,
    }),
    getCityBoundary: builder.query<
      { data: GeoJSON.GeoJSON; boundingBox: BoundingBox },
      string
    >({
      query: (locode) => `city/${locode}/boundary`,
      transformResponse: (response: {
        data: GeoJSON.GeoJSON;
        boundingBox: BoundingBox;
      }) => response,
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
    getInventoryValue: builder.query<
      InventoryValueResponse,
      { subCategoryId: string; inventoryId: string }
    >({
      query: ({ subCategoryId, inventoryId }) =>
        `/inventory/${inventoryId}/value/${subCategoryId}`,
      transformResponse: (response: { data: InventoryValueResponse }) =>
        response.data,
      providesTags: ["InventoryValue"],
    }),
    getInventoryValues: builder.query<
      InventoryValueResponse[],
      { subCategoryIds: string[]; inventoryId: string }
    >({
      query: ({ subCategoryIds, inventoryId }) => ({
        url: `/inventory/${inventoryId}/value`,
        method: "GET",
        params: { subCategoryIds: subCategoryIds.join(",") },
      }),
      transformResponse: (response: { data: InventoryValueResponse[] }) =>
        response.data,
      providesTags: ["InventoryValue"],
    }),
    setInventoryValue: builder.mutation<
      InventoryValueAttributes,
      InventoryValueUpdateQuery
    >({
      query: (data) => ({
        url: `/inventory/${data.inventoryId}/value/${data.subCategoryId}`,
        method: "PATCH",
        body: data.data,
      }),
      transformResponse: (response: { data: InventoryValueAttributes }) =>
        response.data,
      invalidatesTags: ["InventoryProgress", "InventoryValue"],
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
        countryPopulation: number;
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
    getUser: builder.query<
      UserAttributes,
      {
        userId: string;
        locode: string;
      }
    >({
      query: (data) => `/city/${data.locode}/user/${data.userId}`,
      transformResponse: (response: { data: any }) => response.data,
    }),

    setCurrentUserData: builder.mutation<
      UserAttributes,
      {
        name: string;
        email: string;
        role: string;
        userId: string;
        locode: string;
        isOrganization: boolean;
      }
    >({
      query: (data) => ({
        url: `/city/${data.locode}/user/${data.userId}`,
        method: "PATCH",
        body: data,
      }),
    }),
    addUser: builder.mutation<
      UserAttributes,
      {
        name: string;
        email: string;
        role: string;
        locode: string;
        isOrganization: boolean;
      }
    >({
      query: (data) => ({
        url: `/city/${data.locode}/user/`,
        method: "POST",
        body: data,
      }),
    }),
    getCityUsers: builder.query<
      UserAttributes,
      {
        locode: string;
      }
    >({
      query: (data) => `/city/${data.locode}/user/`,
      transformResponse: (response: { data: any }) => response.data,
    }),
    setUserData: builder.mutation<
      UserAttributes,
      Partial<UserAttributes> &
        Pick<UserAttributes, "userId"> &
        Pick<UserAttributes, "defaultCityLocode">
    >({
      query: ({ userId, defaultCityLocode, email, ...rest }) => ({
        url: `/city/${defaultCityLocode}/user/${userId}`,
        method: "PATCH",
        body: rest,
      }),
      invalidatesTags: ["UserData"],
    }),
    removeUser: builder.mutation<
      UserAttributes,
      { userId: string; defaultCityLocode: string }
    >({
      query: ({ defaultCityLocode, userId }) => ({
        url: `/city/${defaultCityLocode}/user/${userId}`,
        method: "DELETE",
      }),
      transformResponse: (response: { data: any }) => response.data,
    }),
    getVerifcationToken: builder.query({
      query: () => ({
        url: "auth/verify",
        method: "GET",
      }),
    }),

    requestVerification: builder.mutation<
      string,
      { password: string; token: string }
    >({
      query: ({ password, token }) => ({
        url: `/auth/verify`,
        method: "POST",
        body: { password, token },
      }),
    }),
    getCities: builder.query({
      query: () => ({
        url: "/city",
        method: "GET",
      }),
      transformResponse: (response: { data: any }) => response.data,
    }),
    removeCity: builder.mutation<string, { locode: string }>({
      query: ({ locode }) => ({
        url: `/city/${locode}`,
        method: "DELETE",
      }),
      transformResponse: (response: { data: any }) => response.data,
    }),
    getInventories: builder.query<InventoryAttributes[], { locode: string }>({
      query: ({ locode }) => ({
        url: `/city/${locode}/inventory`,
        method: "GET",
      }),
      transformResponse: (response: { data: any }) => response.data,
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
  useGetUserQuery,
  useSetCurrentUserDataMutation,
  useGetCityUsersQuery,
  useSetUserDataMutation,
  useRemoveUserMutation,
  useRequestVerificationMutation,
  useGetVerifcationTokenQuery,
  useGetCitiesQuery,
  useGetInventoriesQuery,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
