import { z } from "zod";

export const emailPattern =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const geoJSON = z.object({
  title: z.string(),
  description: z.string(),
  geometry: z.object({
    type: z.literal("Feature"),
    properties: z.object({}),
    geometry: z.object({
      coordinates: z.number().array(),
      type: z.literal("Point"),
    }),
  }),
});

export const createCityRequest = z.object({
  locode: z.string().min(4),
  name: z.string().min(1),
  shape: geoJSON.optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  countryLocode: z.string().optional(),
  regionLocode: z.string().optional(),
  area: z.number().int().optional(),
});
export type CreateCityRequest = z.infer<typeof createCityRequest>;

export const createInventoryRequest = z.object({
  inventoryName: z.string().min(1),
  year: z.number().int().min(2000),
  totalEmissions: z.number().int().optional(),
});
export type CreateInventoryRequest = z.infer<typeof createInventoryRequest>;

// enforces: min one upper- and lowercase charater and one number, min length 4 characters
export const passwordRegex =
  /^(?=(.*[a-z]){1,})(?=(.*[A-Z]){1,})(?=(.*[0-9]){1,}).{4,}$/;
export const signupRequest = z
  .object({
    name: z.string().min(4),
    email: z.string().email(),
    password: z.string().min(4).regex(passwordRegex),
    confirmPassword: z.string().min(4),
    inviteCode: z.string().min(6).max(6),
    acceptTerms: z.literal<boolean>(true),
    inventory: z.string().uuid().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type SignupRequest = z.infer<typeof signupRequest>;

export const forgotRequest = z.object({
  email: z.string().email(),
});

export const resetPasswordRequest = z.object({
  newPassword: z.string().min(4).regex(passwordRegex),
  resetToken: z.string(),
});

export const createInventoryValue = z.object({
  activityValue: z.number().nullable().optional(),
  activityUnits: z.string().nullable().optional(),
  co2eq: z.coerce.bigint().gte(0n).optional(),
  co2eqYears: z.number().optional(),
  unavailableReason: z.string().optional(),
  unavailableExplanation: z.string().optional(),
  gasValues: z
    .array(
      z.object({
        gas: z.string(),
        // if not present, use activityValue with emissionsFactor instead
        gasAmount: z.coerce.bigint().gte(0n).nullable().optional(),
        emissionsFactorId: z.string().uuid().optional(),
        emissionsFactor: z
          .object({
            emissionsPerActivity: z.number().gte(0),
            gas: z.string(),
            units: z.string(),
          })
          .optional(),
      }),
    )
    .optional(),
  dataSource: z
    .object({
      sourceType: z.string(),
      dataQuality: z.string(),
      notes: z.string(),
    })
    .optional(),
});

export type CreateInventoryValueRequest = z.infer<typeof createInventoryValue>;

export const createUserRequest = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string(),
});

export type CreateUserRequest = z.infer<typeof createUserRequest>;

export const createPopulationRequest = z.object({
  cityId: z.string().uuid(),
  cityPopulation: z.number().gte(0),
  regionPopulation: z.number().gte(0),
  countryPopulation: z.number().gte(0),
  cityPopulationYear: z.number().gte(0),
  regionPopulationYear: z.number().gte(0),
  countryPopulationYear: z.number().gte(0),
  datasourceId: z.string().optional(),
});

export type CreatePopulationRequest = z.infer<typeof createPopulationRequest>;

// user file schema validation
export const createUserFileRequset = z.object({
  userId: z.string().uuid(),
  cityId: z.string().uuid(),
  fileReference: z.string().optional(),
  data: z.any(),
  fileType: z.string().optional(),
  fileName: z.string().optional(),
  sector: z.string(),
  subsectors: z.string().array(),
  scopes: z.string().array(),
  url: z.string().url().optional(),
  status: z.string().optional(),
  gpcRefNo: z.string().optional(),
});

// Schema type definition
export type CreateUserFileRequetData = z.infer<typeof createUserFileRequset>;

export const createUserInvite = z.object({
  userId: z.string().optional(),
  invitingUserId: z.string().uuid(),
  inventoryId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  cityId: z.string(),
});

export type CreateUserInvite = z.infer<typeof createUserInvite>;

export const createActivityValueRequest = z.object({
  inventoryValueId: z.string().uuid(),
  activityData: z.any().optional(),
  metadata: z.any().optional(),
  dataSource: z
    .object({
      sourceType: z.string(),
      dataQuality: z.string(),
      notes: z.string(),
    })
    .optional(),
  gasValues: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        emissionsFactorId: z.string().uuid().optional(),
        gas: z.string(),
        gasAmount: z.coerce.bigint().gte(0n).optional(),
        emissionsFactor: z
          .object({
            emissionsPerActivity: z.number().gte(0).optional(),
            gas: z.string().optional(),
            units: z.string().optional(),
            gpcReferenceNumber: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
