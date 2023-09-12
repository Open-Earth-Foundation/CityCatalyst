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
