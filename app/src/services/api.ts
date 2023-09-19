import type { CityAttributes, InventoryAttributes } from "@/models/init-models";
import type { InventoryResponse, InventoryProgressResponse } from "@/util/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v0/", credentials: "include" }),
  endpoints: (builder) => ({
    getCity: builder.query<CityAttributes, string>({
      query: (locode) => `city/${locode}`,
      transformResponse: (response: { data: CityAttributes }) => response.data,
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
  }),
});
