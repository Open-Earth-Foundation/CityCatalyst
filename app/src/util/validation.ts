import { z } from "zod";
import { GlobalWarmingPotentialTypeEnum, InventoryTypeEnum } from "./enums";
import { OrganizationRole, LANGUAGES } from "@/util/types";

export const emailPattern =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
export const tokenRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9_\-]+$/;
export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  projectId: z.string().uuid().optional(),
});
export type CreateCityRequest = z.infer<typeof createCityRequest>;

export const createInventoryRequest = z.object({
  inventoryName: z.string().min(1),
  year: z.number().int().min(2000),
  totalEmissions: z.number().int().optional(),
  totalCountryEmissions: z.number().int().optional(),
  inventoryType: z.nativeEnum(InventoryTypeEnum),
  globalWarmingPotentialType: z.nativeEnum(GlobalWarmingPotentialTypeEnum),
});

export type CreateInventoryRequest = z.infer<typeof createInventoryRequest>;

export const upsertInventoryRequest = z.union([
  createInventoryRequest.strict(),
  z
    .object({
      isPublic: z.boolean().optional(),
    })
    .strict(),
]);
export type UpsertInventoryRequest = z.infer<typeof upsertInventoryRequest>;

// enforces: min one upper- and lowercase charater and one number, min length 4 characters
export const passwordRegex =
  /^(?=(.*[a-z]){1,})(?=(.*[A-Z]){1,})(?=(.*[0-9]){1,}).{4,}$/;
export const signupRequest = z
  .object({
    name: z.string().min(4),
    email: z.string().email(),
    password: z.string().min(4).regex(passwordRegex),
    confirmPassword: z.string().min(4),
    acceptTerms: z.literal<boolean>(true),
    inventory: z.string().uuid().optional(),
    preferredLanguage: z.nativeEnum(LANGUAGES),
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
  gpcReferenceNumber: z.string().optional(),
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
});

export const patchInventoryValue = z.object({
  activityValue: z.number().nullable().optional(),
  activityUnits: z.string().nullable().optional(),
  co2eq: z.coerce.bigint().gte(0n).optional(),
  co2eqYears: z.number().optional(),
  gpcReferenceNumber: z.string(),
  unavailableReason: z.string().optional(),
  unavailableExplanation: z.string().optional(),
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

export const AcceptInvite = z.object({
  email: z.string().email(),
  cityIds: z.array(z.string()),
  token: z.string(),
});

export const AcceptOrganizationInvite = z.object({
  email: z.string().email(),
  organizationId: z.string().uuid(),
  token: z.string(),
});

export const CreateUsersInvite = z.object({
  emails: z.array(z.string().email()),
  cityIds: z.array(z.string()),
});

export type CreateUserInvite = z.infer<typeof createUserInvite>;

const gasValueSchema = z.object({
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
});

export const updateActivityValueRequest = z.object({
  inventoryValueId: z.string().uuid().optional(),
  inventoryValue: z
    .object({
      inputMethodology: z.string(),
      gpcReferenceNumber: z.string(),
      unavailableReason: z.string().optional(),
      unavailableExplanation: z.string().optional(),
    })
    .optional(),
  activityData: z.any().optional(),
  metadata: z.any().optional(),
  gasValues: z.array(gasValueSchema).optional(),
});

export const createActivityValueRequest = z.object({
  activityData: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()),
  inventoryValueId: z.string().uuid().optional(),
  inventoryValue: z
    .object({
      inputMethodology: z.string(),
      gpcReferenceNumber: z.string(),
      unavailableReason: z.string().optional(),
      unavailableExplanation: z.string().optional(),
    })
    .optional(),
  gasValues: z.array(gasValueSchema).optional(),
});

export type CreateActivityValueRequest = z.infer<
  typeof createActivityValueRequest
>;

export const fetchEmissionsFactorRequest = z.object({
  inventoryId: z.string().optional(),
  referenceNumber: z.string().optional(),
  methodologyId: z.string().optional(),
  regionLocode: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updatePasswordRequest = z.object({
  currentPassword: z.string().min(4).max(64),
  confirmPassword: z.string().min(4).max(64).regex(passwordRegex),
});

export type UpdatePasswordRequest = z.infer<typeof updatePasswordRequest>;

export const createOrganizationRequest = z.object({
  name: z
    .string()
    .max(255)
    .refine((val) => val !== "cc_organization_default", {
      message: "Organization name cannot be 'cc_organization_default'",
    }),
  contactEmail: z.string().email().max(255),
});

export type CreateOrganizationRequest = z.infer<
  typeof createOrganizationRequest
>;

export const updateOrganizationRequest = z.object({
  name: z.string().max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
});

export type UpdateOrganizationRequest = z.infer<
  typeof updateOrganizationRequest
>;

export const createOrganizationInviteRequest = z.object({
  organizationId: z.string().uuid(),
  inviteeEmails: z.array(z.string().email()),
  role: z.nativeEnum(OrganizationRole),
});

export type CreateOrganizationInviteRequest = z.infer<
  typeof createOrganizationInviteRequest
>;

export const createProjectRequest = z.object({
  name: z.string().max(255),
  cityCountLimit: z.number().int().min(1),
  description: z.string().optional(),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequest>;

export const updateProjectRequest = z.object({
  name: z.string().max(255).optional(),
  cityCountLimit: z.number().int().min(1).optional(),
  description: z.string().optional(),
});

export type UpdateProjectRequest = z.infer<typeof updateProjectRequest>;

export const transferCitiesRequest = z.object({
  cityIds: z.array(z.string().uuid()).nonempty(),
  projectId: z.string().uuid(),
});

export type TransferCitiesRequest = z.infer<typeof transferCitiesRequest>;

export const whiteLabelSchema = z.object({
  themeId: z.string().min(1, "themeKey is required"),
  logoUrl: z.string().optional(),
  clearLogoUrl: z.string().optional(),
});

export const organizationActiveStateSchema = z.object({
  active: z.boolean(),
});

export const updateUserRoleSchema = z.object({
  contactEmail: z.string().email().max(255),
});
