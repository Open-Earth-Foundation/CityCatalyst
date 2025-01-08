import {
  type CityAttributes,
  type InventoryAttributes,
  type InventoryValueAttributes,
  type PopulationAttributes,
  type UserAttributes,
} from "@/models/init-models";
import type { BoundingBox } from "@/util/geojson";
import {
  CityAndYearsResponse,
  ConnectDataSourceQuery,
  ConnectDataSourceResponse,
  EmissionsForecastData,
  EmissionsFactorResponse,
  GetDataSourcesResult,
  InventoryDeleteQuery,
  InventoryProgressResponse,
  InventoryResponse,
  InventoryUpdateQuery,
  InventoryValueInSubSectorDeleteQuery,
  InventoryValueInSubSectorScopeUpdateQuery,
  InventoryValueResponse,
  InventoryValueUpdateQuery,
  InventoryWithCity,
  RequiredScopesResponse,
  ResultsResponse,
  SectorBreakdownResponse,
  UserFileResponse,
  UserInfoResponse,
  UserInviteResponse,
  YearOverYearResultsResponse,
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
    "ActivityValue",
    "UserData",
    "FileData",
    "CityData",
    "ReportResults",
    "YearlyReportResults",
    "SectorBreakdown",
    "Inventory",
    "CitiesAndInventories",
    "Inventories",
  ],
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => {
    return {
      getCitiesAndYears: builder.query<CityAndYearsResponse[], void>({
        query: () => "user/cities",
        transformResponse: (response: { data: CityAndYearsResponse[] }) =>
          response.data.map(({ city, years }) => ({
            city,
            years: years.sort((a, b) => b.year - a.year),
          })),
        providesTags: ["CitiesAndInventories"],
      }),
      getCityYears: builder.query<CityAndYearsResponse, string>({
        query: (cityId) => `city/${cityId}/years`,
        transformResponse: (response: { data: CityAndYearsResponse }) =>
          response.data,
        providesTags: ["CitiesAndInventories"],
      }),
      getCity: builder.query<CityAttributes, string>({
        query: (cityId) => `city/${cityId}`,
        transformResponse: (response: { data: CityAttributes }) =>
          response.data,
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
        query: (inventoryId: string) => `inventory/${inventoryId}`,
        transformResponse: (response: { data: InventoryResponse }) =>
          response.data,
        providesTags: ["Inventory"],
      }),
      getRequiredScopes: builder.query<RequiredScopesResponse, string>({
        query: (sectorId) => `sector/${sectorId}/required-scopes`,
        transformResponse: (response: { data: RequiredScopesResponse }) =>
          response.data,
      }),
      getResults: builder.query<ResultsResponse, string>({
        query: (inventoryId: string) => `inventory/${inventoryId}/results`,
        transformResponse: (response: { data: ResultsResponse }) =>
          response.data,
        providesTags: ["ReportResults"],
      }),
      getEmissionsForecast: builder.query<EmissionsForecastData, string>({
        query: (inventoryId: string) =>
          `inventory/${inventoryId}/results/emissions-forecast`,
        transformResponse: (response: { data: EmissionsForecastData }) => {
          return response.data;
        },
        providesTags: ["ReportResults"],
      }),

      getYearOverYearResults: builder.query<
        YearOverYearResultsResponse,
        string
      >({
        query: (cityId: string) => `user/cities/${cityId}/results`,
        transformResponse: (response: { data: YearOverYearResultsResponse }) =>
          response.data,
        providesTags: ["YearlyReportResults"],
      }),
      getSectorBreakdown: builder.query<
        SectorBreakdownResponse,
        {
          inventoryId: string;
          sector: string;
        }
      >({
        query: ({
          inventoryId,
          sector,
        }: {
          inventoryId: string;
          sector: string;
        }) => {
          return `inventory/${inventoryId}/results/${sector}`;
        },
        transformResponse: (response: { data: SectorBreakdownResponse }) =>
          response.data,
        providesTags: ["SectorBreakdown"],
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
        transformResponse: (response: { data: CityAttributes }) =>
          response.data,
        invalidatesTags: ["CityData"],
      }),
      addInventory: builder.mutation<
        InventoryAttributes,
        {
          cityId: string;
          year: number;
          inventoryName: string;
          totalCountryEmissions: number;
          globalWarmingPotentialType: string;
          inventoryType: string;
        }
      >({
        query: (data) => ({
          url: `/city/${data.cityId}/inventory`,
          method: "POST",
          body: data,
        }),
        transformResponse: (response: { data: InventoryAttributes }) =>
          response.data,
        invalidatesTags: ["UserInventories", "CitiesAndInventories"],
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
        GetDataSourcesResult,
        { inventoryId: string }
      >({
        query: ({ inventoryId }) => `datasource/${inventoryId}`,
        transformResponse: (response: GetDataSourcesResult) => response,
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
      getInventoryValuesBySubsector: builder.query<
        InventoryValueResponse[],
        {
          inventoryId: string;
          subSectorId: string;
        }
      >({
        query: ({ inventoryId, subSectorId }) => ({
          url: `/inventory/${inventoryId}/value/subsector/${subSectorId}`,
          method: "GET",
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
        invalidatesTags: [
          "Inventory",
          "InventoryProgress",
          "InventoryValue",
          "ReportResults",
          "YearlyReportResults",
        ],
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
        invalidatesTags: [
          "Inventory",
          "InventoryProgress",
          "InventoryValue",
          "ReportResults",
          "YearlyReportResults",
        ],
      }),
      updateOrCreateInventoryValue: builder.mutation<
        InventoryValueAttributes,
        InventoryValueInSubSectorScopeUpdateQuery
      >({
        query: (data) => ({
          url: `/inventory/${data.inventoryId}/value/subsector/${data.subSectorId}`,
          method: "PATCH",
          body: data.data,
        }),
        transformResponse: (response: { data: InventoryValueAttributes }) =>
          response.data,
        invalidatesTags: [
          "Inventory",
          "InventoryProgress",
          "InventoryValue",
          "ActivityValue", // because they are deleted when IV is marked as not available
          "ReportResults",
          "YearlyReportResults",
        ],
      }),
      deleteInventory: builder.mutation<
        InventoryAttributes,
        InventoryDeleteQuery
      >({
        query: (data) => ({
          url: `/inventory/${data.inventoryId}`,
          method: "DELETE",
        }),
        transformResponse: (response: { data: InventoryAttributes }) =>
          response.data,
        invalidatesTags: [
          "InventoryProgress",
          "InventoryValue",
          "Inventories",
          "Inventory",
          "ActivityValue",
          "InventoryValue",
          "ReportResults",
          "YearlyReportResults",
        ],
      }),
      deleteInventoryValue: builder.mutation<
        InventoryValueAttributes,
        InventoryValueInSubSectorDeleteQuery
      >({
        query: (data) => ({
          url: `/inventory/${data.inventoryId}/value/subsector/${data.subSectorId}`,
          method: "DELETE",
        }),
        transformResponse: (response: { data: InventoryValueAttributes }) =>
          response.data,
        invalidatesTags: ["InventoryProgress", "InventoryValue"],
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
        providesTags: ["Inventories"],
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
      getEmissionsFactors: builder.query<
        EmissionsFactorResponse,
        {
          methodologyId: string;
          inventoryId: string;
          referenceNumber: string;
          metadata?: Record<string, any>;
        }
      >({
        query: (params) => {
          return {
            url: `/emissions-factor`,
            method: "POST",
            body: params,
          };
        },
        transformResponse: (response: { data: EmissionsFactorResponse }) => {
          return response.data;
        },
      }),
      disconnectThirdPartyData: builder.mutation({
        query: ({ inventoryId, datasourceId }) => ({
          method: "DELETE",
          url: `datasource/${inventoryId}/datasource/${datasourceId}`,
        }),
        invalidatesTags: [
          "InventoryValue",
          "InventoryProgress",
          "ReportResults",
        ],
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
      connectToCDP: builder.mutation({
        query: ({ inventoryId }) => {
          return {
            method: "POST",
            url: `/inventory/${inventoryId}/cdp`,
          };
        },
      }),

      // ActivityValue CRUD
      getActivityValues: builder.query({
        query: ({
          inventoryId,
          subCategoryIds,
          subSectorId,
          methodologyId,
        }: {
          inventoryId: string;
          subCategoryIds?: string[];
          subSectorId?: string;
          methodologyId?: string;
        }) => ({
          url: `/inventory/${inventoryId}/activity-value`,
          params: {
            subCategoryIds: subCategoryIds?.join(",") ?? undefined,
            subSectorId: subSectorId ?? undefined,
            methodologyId: methodologyId ?? undefined,
          },
          method: "GET",
        }),
        transformResponse: (response: any) => response.data,
        providesTags: ["ActivityValue"],
      }),
      createActivityValue: builder.mutation({
        query: (data) => ({
          method: "POST",
          url: `/inventory/${data.inventoryId}/activity-value`,
          body: data.requestData,
        }),
        transformResponse: (response: any) => response.data,
        invalidatesTags: [
          "Inventory",
          "ActivityValue",
          "InventoryValue",
          "InventoryProgress",
          "YearlyReportResults",
          "ReportResults",
          "SectorBreakdown",
        ],
      }),
      getActivityValue: builder.query({
        query: (data: { inventoryId: string; valueId: string }) => ({
          method: "GET",
          url: `/inventory/${data.inventoryId}/activity-value/${data.valueId}`,
        }),
        transformResponse: (response: any) => response.data,
        providesTags: ["ActivityValue"],
      }),
      updateActivityValue: builder.mutation({
        query: (data) => ({
          method: "PATCH",
          url: `/inventory/${data.inventoryId}/activity-value/${data.valueId}`,
          body: data.data,
        }),
        transformResponse: (response: any) => response.data,
        invalidatesTags: [
          "Inventory",
          "ActivityValue",
          "InventoryValue",
          "InventoryProgress",
          "ReportResults",
          "YearlyReportResults",
          "SectorBreakdown",
        ],
      }),
      deleteActivityValue: builder.mutation({
        query: (data: { activityValueId: string; inventoryId: string }) => ({
          method: "DELETE",
          url: `/inventory/${data.inventoryId}/activity-value/${data.activityValueId}`,
        }),
        transformResponse: (response: { success: boolean }) => response,
        invalidatesTags: [
          "Inventory",
          "ActivityValue",
          "InventoryValue",
          "InventoryProgress",
          "ReportResults",
          "YearlyReportResults",
          "SectorBreakdown",
        ],
      }),
      deleteAllActivityValues: builder.mutation({
        query: (data: {
          inventoryId: string;
          subSectorId?: string;
          gpcReferenceNumber?: string;
        }) => ({
          method: "DELETE",
          url: `/inventory/${data.inventoryId}/activity-value`,
          params: {
            subSectorId: data.subSectorId,
            gpcReferenceNumber: data.gpcReferenceNumber,
          },
        }),
        transformResponse: (response: any) => response.data,
        invalidatesTags: [
          "Inventory",
          "ActivityValue",
          "InventoryValue",
          "InventoryProgress",
          "ReportResults",
          "YearlyReportResults",
          "SectorBreakdown",
        ],
      }),
      createThreadId: builder.mutation({
        query: (data: { inventoryId: string; content: string }) => ({
          url: `/assistants/threads/${data.inventoryId}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: data.content,
          }),
        }),
        transformResponse: (response: { threadId: string }) =>
          response.threadId,
      }),
      updateInventory: builder.mutation<
        InventoryAttributes,
        InventoryUpdateQuery
      >({
        query: (data) => ({
          url: `/inventory/${data.inventoryId}`,
          method: "PATCH",
          body: data.data,
        }),
        transformResponse: (response: { data: InventoryAttributes }) =>
          response.data,
        invalidatesTags: ["Inventory"],
      }),
    };
  },
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
      query: (q) => `/api/v1/search/city?q=${q}`,
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
  useGetCityYearsQuery,
  useGetCitiesAndYearsQuery,
  useGetYearOverYearResultsQuery,
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
  useConnectToCDPMutation,
  useCreateThreadIdMutation,
  useUpdateActivityValueMutation,
  useDeleteAllActivityValuesMutation,
  useDeleteActivityValueMutation,
  useGetInventoryValuesBySubsectorQuery,
  useDeleteInventoryValueMutation,
  useGetResultsQuery,
  useGetEmissionsForecastQuery,
  useUpdateInventoryMutation,
  useUpdateOrCreateInventoryValueMutation,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
