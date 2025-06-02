import {
  type CityAttributes,
  type InventoryAttributes,
  type InventoryValueAttributes,
  type PopulationAttributes,
  type UserAttributes,
} from "@/models/init-models";
import type { BoundingBox } from "@/util/geojson";
import {
  AcceptInviteRequest,
  AcceptInviteResponse,
  CityAndYearsResponse,
  ConnectDataSourceQuery,
  ConnectDataSourceResponse,
  EmissionsFactorResponse,
  EmissionsForecastData,
  GetDataSourcesResult,
  GetUserCityInvitesResponse,
  InventoryDeleteQuery,
  InventoryPopulationsResponse,
  InventoryProgressResponse,
  InventoryResponse,
  InventoryUpdateQuery,
  InventoryValueInSubSectorDeleteQuery,
  InventoryValueInSubSectorScopeUpdateQuery,
  InventoryValueResponse,
  InventoryValueUpdateQuery,
  InventoryWithCity,
  InviteStatus,
  ListOrganizationsResponse,
  OrganizationResponse,
  OrganizationRole,
  ProjectResponse,
  ProjectWithCities,
  RequiredScopesResponse,
  ResultsResponse,
  SectorBreakdownResponse,
  UserAccessResponse,
  UserFileResponse,
  UserInfoResponse,
  UserInviteResponse,
  UsersInvitesRequest,
  UsersInvitesResponse,
  YearOverYearResultsResponse,
  ProjectUserResponse,
  CityWithProjectDataResponse,
  LANGUAGES,
  ACTION_TYPES,
  ThemeResponse,
  OrganizationWithThemeResponse,
  UpdateUserPayload,
  FormulaInputValuesResponse,
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
    "Invites",
    "Organizations",
    "OrganizationInvite",
    "Projects",
    "Organization",
    "Project",
    "ProjectUsers",
    "UserAccessStatus",
    "Cities",
    "Cap",
    "Themes",
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
      getInventoryPopulations: builder.query<
        InventoryPopulationsResponse,
        string
      >({
        query: (inventoryId: string) => `inventory/${inventoryId}/populations`,
        transformResponse: (response: { data: InventoryPopulationsResponse }) =>
          response.data,
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
          projectId?: string;
        }
      >({
        query: (data) => ({
          url: `/city`,
          method: "POST",
          body: data,
        }),
        transformResponse: (response: { data: CityAttributes }) =>
          response.data,
        invalidatesTags: ["CityData", "Projects"],
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
          "UserInfo",
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

      setCurrentUserData: builder.mutation<UserAttributes, UpdateUserPayload>({
        query: (data) => ({
          url: `/user/${data.userId}`,
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
      getCityInvites: builder.query<GetUserCityInvitesResponse[], void>({
        query: () => `/user/invites`,
        transformResponse: (response: { data: any }) => response.data,
        providesTags: ["Invites"],
      }),
      setUserData: builder.mutation<
        UserAttributes,
        Partial<UserAttributes> & Pick<UserAttributes, "userId">
      >({
        query: ({ userId, ...rest }) => ({
          url: `/user/${userId}`,
          method: "PATCH",
          body: rest,
        }),
        invalidatesTags: ["UserData"],
      }),
      cancelInvite: builder.mutation<void, { cityInviteId: string }>({
        query: ({ cityInviteId }) => ({
          url: `/user/invites/${cityInviteId}`,
          method: "DELETE",
        }),
        transformResponse: (response: { data: any }) => response.data,
        invalidatesTags: ["Invites"],
      }),
      resetInvite: builder.mutation<void, { cityInviteId: string }>({
        query: ({ cityInviteId }) => ({
          url: `/user/invites/${cityInviteId}`,
          method: "PATCH",
        }),
        transformResponse: (response: { data: any }) => response.data,
        invalidatesTags: ["Invites"],
      }),
      getVerificationToken: builder.query({
        query: () => ({
          url: "/auth/verify",
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
        invalidatesTags: ["CityData", "Projects"],
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
        invalidatesTags: ["Invites"],
        transformResponse: (response: { data: UserInviteResponse }) =>
          response.data,
      }),
      inviteUsers: builder.mutation<UsersInvitesResponse, UsersInvitesRequest>({
        query: (data) => {
          return {
            method: "POST",
            url: `/user/invites`,
            body: data,
          };
        },
        transformResponse: (response: UsersInvitesResponse) => {
          return response;
        },
        invalidatesTags: ["ProjectUsers", "Invites"],
      }),
      acceptInvite: builder.mutation<AcceptInviteResponse, AcceptInviteRequest>(
        {
          query: (data) => {
            return {
              method: "PATCH",
              url: `/user/invites/accept`,
              body: data,
            };
          },
          transformResponse: (response: { data: AcceptInviteResponse }) =>
            response.data,
          invalidatesTags: [
            "Invites",
            "UserData",
            "CitiesAndInventories",
            "UserInfo",
            "CityData",
            "Cities",
            "Inventories",
            "Project",
            "Projects",
            "ProjectUsers",
            "UserAccessStatus",
          ],
        },
      ),
      acceptOrganizationAdminInvite: builder.mutation({
        query: (data: {
          token: string;
          organizationId: string;
          email: string;
        }) => {
          return {
            method: "PATCH",
            url: `/organizations/${data.organizationId}/invitations/accept`,
            body: data,
          };
        },
        transformResponse: (response: any) => response,
        invalidatesTags: [
          "UserAccessStatus",
          "Projects",
          "Organizations",
          "OrganizationInvite",
          "ProjectUsers",
          "UserInventories",
          "CitiesAndInventories",
          "Inventories",
          "Projects",
          "Organization",
          "Project",
        ],
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
      updatePassword: builder.mutation({
        query: (data) => ({
          url: `/auth/update-password`,
          method: "POST",
          body: data,
        }),
      }),
      // Get unfinished subsectors
      getNotationKeyScopes: builder.query({
        query: (data: { inventoryId: string }) => ({
          url: `/inventory/${data.inventoryId}/notation-keys`,
          method: "GET",
        }),
        transformResponse: (response: any) => response,
      }),
      // Add notation keys to subsectors with missing data missing
      updateOrCreateNotationKeys: builder.mutation({
        query: (data: {
          inventoryId: string;
          notationKeys: {
            subCategoryId: string;
            unavailableReason: string;
            unavailableExplanation: string;
          }[];
        }) => ({
          url: `/inventory/${data.inventoryId}/notation-keys`,
          method: "POST",
          body: { notationKeys: data.notationKeys },
        }),
        transformResponse: (response: any) => response.data,
      }),
      createOrganization: builder.mutation({
        query: (data: { name: string; contactEmail: string }) => ({
          url: `/organizations`,
          method: "POST",
          body: { ...data },
        }),
        transformResponse: (response: OrganizationResponse) => {
          return response;
        },
        invalidatesTags: ["Organizations"],
      }),
      updateOrganization: builder.mutation({
        query: (data: { id: string; name: string; contactEmail: string }) => ({
          url: `/organizations/${data.id}`,
          method: "PATCH",
          body: { name: data.name, contactEmail: data.contactEmail },
        }),
        transformResponse: (response: OrganizationResponse) => {
          return response;
        },
        invalidatesTags: ["Organizations", "Organization"],
      }),
      createProject: builder.mutation({
        query: (data: {
          organizationId: string;
          name: string;
          cityCountLimit: number;
          description: string;
        }) => ({
          url: `/organizations/${data.organizationId}/projects`,
          method: "POST",
          body: {
            name: data.name,
            cityCountLimit: data.cityCountLimit,
            description: data.description,
          },
        }),
        transformResponse: (response: ProjectResponse) => response,
        invalidatesTags: ["Projects"],
      }),
      editProject: builder.mutation({
        query: (data: {
          projectId: string;
          name: string;
          cityCountLimit: number;
          description: string;
        }) => ({
          url: `/projects/${data.projectId}`,
          method: "PATCH",
          body: {
            name: data.name,
            cityCountLimit: data.cityCountLimit,
            description: data.description,
          },
        }),
        transformResponse: (response: ProjectResponse) => response,
        invalidatesTags: [
          "Projects",
          "Project",
          "Organizations",
          "Organization",
        ],
      }),
      deleteProject: builder.mutation({
        query: (projectId: string) => ({
          url: `/projects/${projectId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["Projects", "Project"],
      }),
      getProject: builder.query({
        query: (data: { projectId: string }) => ({
          url: `/projects/${data.projectId}`,
          method: "GET",
        }),
        transformResponse: (response: ProjectResponse) => response,
        providesTags: ["Projects", "Project"],
      }),
      createOrganizationInvite: builder.mutation({
        query: (data: {
          organizationId: string;
          inviteeEmail: string;
          role: OrganizationRole;
        }) => ({
          url: `/organizations/${data.organizationId}/invitations`,
          method: "POST",
          body: {
            inviteeEmail: data.inviteeEmail,
            role: data.role,
            organizationId: data.organizationId,
          },
        }),
        transformResponse: (response: any) => response,
        invalidatesTags: [
          "OrganizationInvite",
          "Organizations",
          "ProjectUsers",
        ],
      }),
      getOrganizations: builder.query({
        query: () => ({
          method: "GET",
          url: `/organizations`,
        }),
        transformResponse: (response: ListOrganizationsResponse[]) =>
          response.map((org) => ({
            ...org,
            status: org.organizationInvite.find(
              (invite) => invite.status === InviteStatus.ACCEPTED,
            )
              ? "accepted"
              : "invite sent",
          })),
        providesTags: ["Organizations"],
      }),
      getProjects: builder.query({
        query: (data: { organizationId: string }) => ({
          method: "GET",
          url: `/organizations/${data.organizationId}/projects`,
        }),
        transformResponse: (response: ProjectWithCities[]) => response,
        providesTags: ["Projects"],
      }),
      getOrganization: builder.query({
        query: (organizationId: string) => ({
          method: "GET",
          url: `/organizations/${organizationId}`,
        }),
        transformResponse: (response: OrganizationResponse) => response,
        providesTags: ["Organizations", "Organization"],
      }),
      createBulkInventories: builder.mutation({
        query: (data: {
          projectId: string;
          emails: string[];
          cityLocodes: string[];
          years: number[];
          scope: string;
          gwp: string;
        }) => ({
          url: `/admin/bulk`,
          method: "POST",
          body: data,
        }),
        transformResponse: (response: any) => response,
      }),
      connectDataSources: builder.mutation({
        query: (data: {
          userEmail: string;
          cityLocodes: string[];
          years: number[];
        }) => ({
          url: `/admin/connect-sources`,
          method: "POST",
          body: data,
        }),
        transformResponse: (response: any) => response,
      }),
      getProjectUsers: builder.query({
        query: (projectId: string) => ({
          method: "GET",
          url: `/projects/${projectId}/users`,
        }),
        transformResponse: (response: ProjectUserResponse[]) => response,
        providesTags: ["ProjectUsers"],
      }),
      deleteProjectUser: builder.mutation({
        query: (data: { projectId: string; email: string }) => ({
          method: "DELETE",
          url: `/projects/${data.projectId}/users?email=${data.email}`,
        }),
        transformResponse: (response: any) => response,
        invalidatesTags: ["ProjectUsers"],
      }),
      deleteCityUser: builder.mutation({
        query: (data: { cityId: string; email: string }) => ({
          method: "DELETE",
          url: `/city/${data.cityId}/user?email=${data.email}`,
        }),
        transformResponse: (response: any) => response,
        invalidatesTags: ["ProjectUsers"],
      }),
      deleteOrganizationAdminUser: builder.mutation({
        query: (data: { organizationId: string; email: string }) => ({
          method: "DELETE",
          url: `/organizations/${data.organizationId}/users?email=${data.email}`,
        }),
        transformResponse: (response: any) => response,
        invalidatesTags: ["ProjectUsers"],
      }),
      getUserAccessStatus: builder.query({
        query: () => ({
          method: "GET",
          url: `/user/access-status`,
        }),
        transformResponse: (response: { data: UserAccessResponse }) =>
          response.data,
        providesTags: ["UserAccessStatus"],
      }),
      getUserProjects: builder.query({
        query: () => ({
          method: "GET",
          url: `/user/projects`,
        }),
        transformResponse: (response: ProjectWithCities[]) => response,
        providesTags: ["Projects"],
      }),
      getAllCitiesInSystem: builder.query({
        query: () => ({
          method: "GET",
          url: `/admin/all-cities`,
        }),
        transformResponse: (response: {
          data: CityWithProjectDataResponse[];
        }) => response.data,
        providesTags: ["Cities"],
      }),
      transferCities: builder.mutation({
        query: (data: { projectId: string; cityIds: string[] }) => ({
          url: `/city/transfer`,
          method: "PATCH",
          body: data,
        }),
        transformResponse: (response: any) => response,
        invalidatesTags: ["Cities", "Organizations"],
      }),
      getProjectBoundaries: builder.query({
        query: (projectId: string) => ({
          method: "GET",
          url: `projects/${projectId}/boundaries`,
        }),
        transformResponse: (response: any) => response.result,
        providesTags: ["Inventory"],
      }),
      getProjectSummary: builder.query({
        query: (projectId: string) => ({
          method: "GET",
          url: `projects/${projectId}/summary`,
        }),
        providesTags: ["Inventory"],
      }),
      getCap: builder.query<
        string,
        { inventoryId: string; actionType: ACTION_TYPES; lng: LANGUAGES }
      >({
        query: ({ inventoryId, actionType, lng }) => ({
          url: `inventory/${inventoryId}/cap?actionType=${actionType}&lng=${lng}`,
          method: "GET",
        }),
        transformResponse: (response: { data: string }) => response.data,
        providesTags: ["Cap"],
      }),
      setOrgWhiteLabel: builder.mutation({
        query: (data: {
          organizationId: string;
          whiteLabelData: {
            themeId: string;
            logo?: File;
            clearLogoUrl?: boolean;
          };
        }) => {
          const formData = new FormData();
          formData.append("themeId", data.whiteLabelData.themeId);

          if (data.whiteLabelData.clearLogoUrl) {
            formData.append("clearLogoUrl", "true");
          }

          if (data.whiteLabelData.logo) {
            formData.append("file", data.whiteLabelData.logo);
          }

          return {
            url: `/organizations/${data.organizationId}/white-label`,
            method: "PATCH",
            body: formData,
          };
        },
        transformResponse: (response: { data: OrganizationResponse }) =>
          response.data,
        invalidatesTags: ["Organizations", "Organization"],
      }),
      getThemes: builder.query({
        query: () => ({
          method: "GET",
          url: `/organizations/themes`,
        }),
        transformResponse: (response: ThemeResponse[]) => response,
        providesTags: ["Themes"],
      }),
      getOrganizationForInventory: builder.query({
        query: (inventoryId: string) => ({
          method: "GET",
          url: `/inventory/${inventoryId}/organization`,
        }),
        transformResponse: (response: OrganizationWithThemeResponse) =>
          response,
        providesTags: ["Organization"],
      }),
      getWasteCompositionValues: builder.query({
        query: ({
          methodologyName,
          inventoryId,
        }: {
          methodologyName: string;
          inventoryId: string;
        }) => ({
          method: "GET",
          url: `/waste-composition`,
          params: {
            methodologyName,
            inventoryId,
          },
        }),
        transformResponse: (response: { data: FormulaInputValuesResponse[] }) =>
          response.data,
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
  useCancelInviteMutation,
  useResetInviteMutation,
  useRequestVerificationMutation,
  useGetVerificationTokenQuery,
  useGetCitiesQuery,
  useGetInventoriesQuery,
  useAddUserFileMutation,
  useGetUserFilesQuery,
  useDeleteUserFileMutation,
  useDisconnectThirdPartyDataMutation,
  useInviteUserMutation,
  useInviteUsersMutation,
  useAcceptInviteMutation,
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
  useGetCityInvitesQuery,
  useUpdatePasswordMutation,
  useGetInventoryPopulationsQuery,
  useGetNotationKeyScopesQuery,
  useUpdateOrCreateNotationKeysMutation,
  useCreateOrganizationMutation,
  useCreateProjectMutation,
  useCreateOrganizationInviteMutation,
  useGetOrganizationsQuery,
  useGetProjectQuery,
  useGetProjectsQuery,
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
  useEditProjectMutation,
  useDeleteProjectMutation,
  useCreateBulkInventoriesMutation,
  useConnectDataSourcesMutation,
  useGetProjectUsersQuery,
  useGetUserAccessStatusQuery,
  useGetAllCitiesInSystemQuery,
  useGetUserProjectsQuery,
  useTransferCitiesMutation,
  useGetCapQuery,
  useGetThemesQuery,
  useSetOrgWhiteLabelMutation,
  useGetOrganizationForInventoryQuery,
  useGetWasteCompositionValuesQuery,
} = api;
export const { useGetOCCityQuery, useGetOCCityDataQuery } = openclimateAPI;
