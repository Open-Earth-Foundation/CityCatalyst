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
  UserFileResponse,
  EmissionsFactorResponse,
  UserInviteResponse,
} from "@/util/types";
import type { GeoJSON } from "geojson";
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
    "FileData",
    "CityData",
  ],
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => ({
    getCity: builder.query<CityAttributes, string>({
      query: (cityId) => `city/${cityId}`,
      transformResponse: (response: { data: CityAttributes }) => response.data,
    }),
    getCityBoundary: builder.query<
      { data: GeoJSON; boundingBox: BoundingBox; area: number },
      string
    >({
      query: (cityId) => `city/${cityId}/boundary`,
      transformResponse: (response: {
        data: GeoJSON;
        boundingBox: BoundingBox;
        area: number;
      }) => response,
    }),
    getInventory: builder.query<InventoryResponse, string>({
      query: (inventoryId) => `inventory/${inventoryId}`,
      transformResponse: (response: { data: InventoryResponse }) =>
        response.data,
    }),
    getInventoryProgress: builder.query<InventoryProgressResponse, string>({
      query: (inventoryId) => `inventory/${inventoryId}/progress`,
      transformResponse: (response: { data: InventoryProgressResponse }) =>
        response.data,
      providesTags: ["InventoryProgress"],
    }),
    addCity: builder.mutation<
      CityAttributes,
      {
        name: string;
        locode: string;
        area: number | undefined;
        region: string;
        country: string;
        regionLocode: string;
        countryLocode: string;
      }
    >({
      query: (data) => ({
        url: `/city`,
        method: "POST",
        body: data,
      }),
      transformResponse: (response: { data: CityAttributes }) => response.data,
      invalidatesTags: ["CityData"],
    }),
    addInventory: builder.mutation<
      InventoryAttributes,
      { cityId: string; year: number; inventoryName: string }
    >({
      query: (data) => ({
        url: `/city/${data.cityId}/inventory`,
        method: "POST",
        body: data,
      }),
      transformResponse: (response: { data: InventoryAttributes }) =>
        response.data,
      invalidatesTags: ["UserInventories"],
    }),
    setUserInfo: builder.mutation<
      UserAttributes,
      { cityId: string; defaultInventoryId: string }
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
        locode: string;
        cityPopulation: number;
        regionPopulation: number;
        countryPopulation: number;
        cityPopulationYear: number;
        regionPopulationYear: number;
        countryPopulationYear: number;
      }
    >({
      query: (data) => {
        return {
          url: `/city/${data.cityId}/population`,
          method: `POST`,
          body: data,
        };
      },
    }),
    getCityPopulation: builder.query<
      PopulationAttributes,
      {
        year: number;
        cityId: string;
      }
    >({
      query: (data) => `/city/${data.cityId}/population/${data.year}`,
      transformResponse: (response: { data: PopulationAttributes }) =>
        response.data,
    }),
    getUser: builder.query<
      UserAttributes,
      {
        userId: string;
        cityId: string;
      }
    >({
      query: (data) => `/city/${data.cityId}/user/${data.userId}`,
      transformResponse: (response: { data: any }) => response.data,
      providesTags: ["UserData"],
    }),

    setCurrentUserData: builder.mutation<
      UserAttributes,
      {
        name: string;
        email: string;
        role: string;
        userId: string;
        cityId: string;
      }
    >({
      query: (data) => ({
        url: `/city/${data.cityId}/user/${data.userId}`,
        method: "PATCH",
        body: data,
      }),
    }),
    checkUser: builder.mutation<
      UserAttributes,
      {
        email: string;
        cityId: string;
      }
    >({
      query: (data) => ({
        url: `/city/${data.cityId}/user/`,
        method: "POST",
        body: data,
      }),
      transformResponse: (response: { data: any }) => response.data,
      invalidatesTags: ["UserData"],
    }),
    getCityUsers: builder.query<
      UserAttributes,
      {
        cityId: string;
      }
    >({
      query: (data) => `/city/${data.cityId}/user/`,
      transformResponse: (response: { data: any }) => response.data,
      providesTags: ["UserData"],
    }),
    setUserData: builder.mutation<
      UserAttributes,
      Partial<UserAttributes> &
        Pick<UserAttributes, "userId"> & { cityId: string }
    >({
      query: ({ userId, cityId, email, ...rest }) => ({
        url: `/city/${cityId}/user/${userId}`,
        method: "PATCH",
        body: rest,
      }),
      invalidatesTags: ["UserData"],
    }),
    removeUser: builder.mutation<
      UserAttributes,
      { userId: string; cityId: string }
    >({
      query: ({ cityId, userId }) => ({
        url: `/city/${cityId}/user/${userId}`,
        method: "DELETE",
      }),
      transformResponse: (response: { data: any }) => response.data,
      invalidatesTags: ["UserData"],
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
      providesTags: ["CityData"],
    }),
    removeCity: builder.mutation<string, { cityId: string }>({
      query: ({ cityId }) => ({
        url: `/city/${cityId}`,
        method: "DELETE",
      }),
      transformResponse: (response: { data: any }) => response.data,
      invalidatesTags: ["CityData"],
    }),
    getInventories: builder.query<InventoryAttributes[], { cityId: string }>({
      query: ({ cityId }) => ({
        url: `/city/${cityId}/inventory`,
        method: "GET",
      }),
      transformResponse: (response: { data: any }) => response.data,
    }),
    addUserFile: builder.mutation<UserFileResponse, any>({
      query: ({ formData, cityId }) => {
        return {
          method: "POST",
          url: `city/${cityId}/file`,
          body: formData,
        };
      },
      transformResponse: (response: { data: UserFileResponse }) =>
        response.data,
      invalidatesTags: ["FileData"],
    }),
    getUserFiles: builder.query({
      query: (cityId: string) => ({
        method: "GET",
        url: `/city/${cityId}/file`,
      }),
      transformResponse: (response: { data: UserFileResponse }) => {
        return response.data;
      },

      providesTags: ["FileData"],
    }),
    deleteUserFile: builder.mutation({
      query: (params) => ({
        method: "DELETE",
        url: `/city/${params.cityId}/file/${params.fileId}`,
      }),
      transformResponse: (response: { data: UserFileResponse }) =>
        response.data,
      invalidatesTags: ["FileData"],
    }),
    getEmissionsFactors: builder.query<EmissionsFactorResponse, void>({
      query: () => `/emissions-factor`,
      transformResponse: (response: { data: EmissionsFactorResponse }) =>
        response.data,
    }),
    disconnectThirdPartyData: builder.mutation({
      query: ({ inventoryId, subCategoryId }) => ({
        method: "DELETE",
        url: `inventory/${inventoryId}/value/${subCategoryId}`,
      }),
      invalidatesTags: ["InventoryValue", "InventoryProgress"],
      transformResponse: (response: { data: EmissionsFactorResponse }) =>
        response.data,
    }),
    // User invitation to city
    inviteUser: builder.mutation<
      UserInviteResponse,
      {
        cityId: string;
        name?: string;
        email: string;
        userId: string;
        invitingUserId: string;
        inventoryId: string;
      }
    >({
      query: (data) => {
        return {
          method: "POST",
          url: `/city/invite`,
          body: data,
        };
      },

      transformResponse: (response: { data: UserInviteResponse }) =>
        response.data,
    }),
    mockData: builder.query({
      query: () => {
        return {
          method: "GET",
          url: "/mock",
        };
      },
      transformResponse: (response: { data: [] }) => response.data,
    }),
  }),
});

export const openclimateAPI = createApi({
  reducerPath: "openclimateapi",
  baseQuery: fetchBaseQuery({
    baseUrl:
      process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL ||
      "https://app.openclimate.network",
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
      transformResponse: (response: any) => {
        return response.data;
      },
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
  useAddUserFileMutation,
  useGetUserFilesQuery,
  useDeleteUserFileMutation,
  useDisconnectThirdPartyDataMutation,
  useInviteUserMutation,
  useCheckUserMutation,
  useMockDataQuery,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
